require('dotenv').config();

class LLMProvider {
  constructor(config = {}) {
    this.config = {
      provider: config.provider || process.env.LLM_PROVIDER || 'mock',
      apiKey: config.apiKey || process.env.LLM_API_KEY || '',
      model: config.model || process.env.LLM_MODEL || 'mock-model',
      baseUrl: config.baseUrl || process.env.LLM_BASE_URL || '',
    };
    this.lastRequestAt = 0;
  }

  async generateText() {
    throw new Error('LLMProvider.generateText() must be implemented by a concrete provider.');
  }

  async generateStructuredOutput() {
    throw new Error('LLMProvider.generateStructuredOutput() must be implemented by a concrete provider.');
  }
}

class MockLLMProvider extends LLMProvider {
  async generateText(prompt) {
    return {
      provider: this.config.provider,
      model: this.config.model,
      text: `Mock response for prompt length ${String(prompt || '').length}`,
      modelUsed: this.config.model,
    };
  }

  async generateStructuredOutput(prompt, schema) {
    return {
      provider: this.config.provider,
      model: this.config.model,
      prompt,
      schema,
      output: {
        status: 'mock-output',
        note: 'This is a placeholder implementation for local or no-key execution.',
      },
      modelUsed: this.config.model,
    };
  }
}

class GeminiLLMProvider extends LLMProvider {
  static wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static getDefaultBaseUrl() {
    return 'https://generativelanguage.googleapis.com/v1beta/openai';
  }

  static getFallbackModels() {
    return ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.7-flash'];
  }

  async generateText(prompt, options = {}) {
    if (!this.config.apiKey) {
      return {
        provider: 'mock',
        model: this.config.model,
        text: `Mock response for prompt length ${String(prompt || '').length}`,
        fallback: true,
        warning: 'No Gemini API key configured. Falling back to mock provider.',
        modelUsed: this.config.model,
      };
    }

    const modelList = Array.from(new Set([options.model || this.config.model || 'gemini-3.6-flash', ...GeminiLLMProvider.getFallbackModels()].filter(Boolean)));
    let attempt = 0;

    for (const modelName of modelList) {
      let modelAttempt = 0;
      while (modelAttempt < 3) {
        const result = await this.generateTextOnce(prompt, { ...options, model: modelName });
        if (!result?.error) {
          return result;
        }

        if (result.truncated && modelAttempt < 2) {
          const expandedTokens = Math.max(options.maxTokens || 300, 4000);
          console.log(`[Gemini] response truncated for ${modelName} (finish_reason === "length"). Retrying ${modelAttempt + 1}/3 with maxTokens=${expandedTokens}...`);
          options = { ...options, maxTokens: expandedTokens };
          modelAttempt += 1;
          continue;
        }

        const shouldRetry = Boolean(result.transientError) || Boolean(result.retryable) || /rate limit|timeout|temporar|unavailable|overloaded|too many requests|truncat/i.test(String(result.message || ''));
        if (shouldRetry && modelAttempt < 2) {
          const waitMs = 2000 * (modelAttempt + 1);
          console.log(`[Gemini] transient error for ${modelName}. Retry ${modelAttempt + 1}/3 in ${waitMs}ms. Error: ${String(result.message || '').slice(0, 250)}`);
          await GeminiLLMProvider.wait(waitMs);
          modelAttempt += 1;
          continue;
        }

        if (modelName !== modelList[modelList.length - 1]) {
          console.log(`[Gemini] moving to next fallback model: ${modelName} failed, trying ${modelList[modelList.indexOf(modelName) + 1]}`);
        }
        break;
      }

      if (attempt >= modelList.length - 1) {
        return {
          provider: 'gemini',
          model: modelName,
          error: true,
          message: 'Gemini request failed after all fallback attempts.',
          transientError: true,
          modelUsed: modelName,
        };
      }
      attempt += 1;
    }

    return {
      provider: 'gemini',
      model: modelList[0],
      error: true,
      message: 'Gemini request failed after all fallback attempts.',
      transientError: true,
      modelUsed: modelList[0],
    };
  }

  async generateTextOnce(prompt, options = {}) {
    const modelName = options.model || this.config.model || 'gemini-3.6-flash';
    const baseUrl = this.config.baseUrl || GeminiLLMProvider.getDefaultBaseUrl();
    const url = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
    const messages = Array.isArray(prompt)
      ? prompt.map((entry) => ({
          role: entry.role || 'user',
          content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
        }))
      : [{ role: 'user', content: String(prompt || '') }];

    const payload = {
      model: modelName,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: Math.max(options.maxTokens ?? 300, 300),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseText = await response.text();
      if (!response.ok) {
        const transientError = /rate limit|temporar|unavailable|too many requests|overloaded|timeout/i.test(responseText || '');
        return {
          provider: 'gemini',
          model: modelName,
          error: true,
          message: `Gemini request failed with ${modelName}: ${responseText || 'request failed'}`,
          transientError,
          modelUsed: modelName,
        };
      }

      const responseJson = JSON.parse(responseText || '{}');
      const choice = responseJson?.choices?.[0];
      const content = choice?.message?.content;
      const finishReason = choice?.finish_reason;

      if (finishReason === 'length' || !content || typeof content !== 'string') {
        const isTruncated = finishReason === 'length';
        return {
          provider: 'gemini',
          model: modelName,
          error: true,
          message: isTruncated
            ? `Gemini response truncated (finish_reason === "length") for ${modelName}.`
            : `Gemini returned an empty or invalid response for ${modelName}.`,
          transientError: true,
          retryable: true,
          truncated: isTruncated,
          modelUsed: modelName,
        };
      }

      return {
        provider: 'gemini',
        model: modelName,
        text: content.trim(),
        modelUsed: modelName,
      };
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? `Gemini API request timed out for ${modelName}.`
        : error?.message || `Gemini API request failed unexpectedly for ${modelName}.`;

      return {
        provider: 'gemini',
        model: modelName,
        error: true,
        message,
        transientError: /rate limit|timeout|temporar|unavailable|overloaded|too many requests/i.test(message),
        modelUsed: modelName,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateStructuredOutput(prompt, schema) {
    const schemaDescription = schema
      ? `Return valid JSON only. Keep the response compact. Use only the required keys. Do not include reasoning, markdown, or surrounding text. The keys are: ${Object.keys(schema.properties || {}).join(', ')}.`
      : 'Return valid JSON only. Keep the response compact and do not include reasoning, markdown, or surrounding text.';

    const structuredPrompt = Array.isArray(prompt)
      ? [...prompt, { role: 'user', content: schemaDescription }]
      : [{ role: 'user', content: `${String(prompt || '')}\n${schemaDescription}` }];

    const result = await this.generateText(structuredPrompt, { temperature: 0.1, maxTokens: 800 });
    if (result?.error) {
      return result;
    }

    try {
      const rawText = typeof result.text === 'string' ? result.text : JSON.stringify(result.output || {});
      const cleanedText = rawText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleanedText || '{}');
      return {
        provider: 'gemini',
        model: result.modelUsed || this.config.model,
        output: parsed,
        modelUsed: result.modelUsed || this.config.model,
      };
    } catch (error) {
      return {
        provider: 'gemini',
        model: result.modelUsed || this.config.model,
        error: true,
        message: 'Gemini returned a non-JSON response for structured output.',
        modelUsed: result.modelUsed || this.config.model,
      };
    }
  }
}

class GroqLLMProvider extends LLMProvider {
  static wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static parseRateLimitWaitSeconds(rawText) {
    if (!rawText || typeof rawText !== 'string') return 0;

    const text = rawText.toLowerCase();
    const match = text.match(/please try again in\s*(\d+(?:\.\d+)?)\s*(s|sec|second|seconds|ms|m)?/i);
    if (!match) {
      return 0;
    }

    const value = Number.parseFloat(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    if (unit === 'ms') return value / 1000;
    if (unit === 'm') return value * 60;
    return value;
  }

  static getFallbackModels() {
    return ['qwen/qwen3.6-27b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
  }

  static stripStructuredNoise(text) {
    if (typeof text !== 'string') {
      return '';
    }

    let cleaned = text.trim();
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/```\s*$/i, '');
    cleaned = cleaned.trim();

    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }

    const bracketIndex = cleaned.indexOf('{');
    if (bracketIndex !== -1) {
      return cleaned.slice(bracketIndex).trim();
    }

    return cleaned;
  }

  static isTransientError(responseText) {
    if (!responseText) {
      return false;
    }

    try {
      const parsed = JSON.parse(responseText);
      const errorInfo = parsed?.error || {};
      const errorCode = errorInfo?.code || '';
      const errorMsg = (errorInfo?.message || '').toLowerCase();
      return ['rate_limit_exceeded', 'server_error', 'overloaded_error', 'unavailable', 'model_not_found', 'model_unavailable'].includes(errorCode)
        || /rate limit|temporar|unavailable|too many requests|overloaded|not found|not available/i.test(errorMsg);
    } catch (error) {
      return /rate limit|temporar|unavailable|too many requests|overloaded|not found|not available/i.test(responseText.toLowerCase());
    }
  }

  async generateText(prompt, options = {}) {
    if (!this.config.apiKey) {
      return {
        provider: 'mock',
        model: this.config.model,
        text: `Mock response for prompt length ${String(prompt || '').length}`,
        fallback: true,
        warning: 'No Groq API key configured. Falling back to mock provider.',
        modelUsed: this.config.model,
      };
    }

    const modelList = Array.from(new Set([this.config.model, ...GroqLLMProvider.getFallbackModels()].filter(Boolean)));

    for (const modelName of modelList) {
      const result = await this.generateTextWithRetry(prompt, {
        ...options,
        model: modelName,
      });

      if (!result?.error) {
        return result;
      }

      if (result.transientError || result.retryable) {
        console.log(`[Groq] model ${modelName} failed with transient/error state. Details: ${String(result.message || '').slice(0, 400)}`);
        console.log(`[Groq] moving to next fallback model if available.`);
        continue;
      }

      return result;
    }

    return {
      provider: 'groq',
      model: this.config.model,
      error: true,
      message: 'All Groq models failed due to transient availability issues. Please try again later.',
      modelUsed: this.config.model,
      transientError: true,
    };
  }

  async generateTextWithModel(prompt, options = {}) {
    const modelName = options.model || this.config.model || 'openai/gpt-oss-20b';
    const now = Date.now();
    const minGapMs = 10000;
    if (this.lastRequestAt && now - this.lastRequestAt < minGapMs) {
      const waitMs = minGapMs - (now - this.lastRequestAt);
      console.log(`[Groq] pacing delay before request to ${modelName}: waiting ${Math.ceil(waitMs / 1000)}s to respect Groq TPM budget.`);
      await GroqLLMProvider.wait(waitMs);
    }
    this.lastRequestAt = Date.now();

    const messages = Array.isArray(prompt)
      ? prompt.map((entry) => ({
          role: entry.role || 'user',
          content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
        }))
      : [{ role: 'user', content: String(prompt || '') }];

    const payload = {
      model: modelName,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 300,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseText = await response.text();
      if (!response.ok) {
        const transientError = GroqLLMProvider.isTransientError(responseText);
        const message = responseText ? responseText.slice(0, 500) : 'Groq API request failed.';

        return {
          provider: 'groq',
          model: modelName,
          error: true,
          message: `Groq request failed with ${modelName}: ${message}`,
          transientError,
          modelUsed: modelName,
        };
      }

      const responseJson = JSON.parse(responseText || '{}');
      const content = responseJson?.choices?.[0]?.message?.content;
      const finishReason = responseJson?.choices?.[0]?.finish_reason;

      if (!content || typeof content !== 'string') {
        return {
          provider: 'groq',
          model: modelName,
          error: true,
          message: `Groq returned an empty or invalid response for ${modelName}.`,
          transientError: false,
          modelUsed: modelName,
          retryable: true,
        };
      }

      if (finishReason === 'length') {
        return {
          provider: 'groq',
          model: modelName,
          text: content.trim(),
          modelUsed: modelName,
          truncated: true,
        };
      }

      return {
        provider: 'groq',
        model: modelName,
        text: content.trim(),
        modelUsed: modelName,
      };
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? `Groq API request timed out for ${modelName}.`
        : error?.message || `Groq API request failed unexpectedly for ${modelName}.`;

      return {
        provider: 'groq',
        model: modelName,
        error: true,
        message,
        transientError: /rate limit|timeout|temporar|unavailable|overloaded|too many requests/i.test(message),
        modelUsed: modelName,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateTextWithRetry(prompt, options = {}) {
    const modelName = options.model || this.config.model || 'openai/gpt-oss-20b';
    let result = await this.generateTextWithModel(prompt, options);
    let retryCount = 0;

    while (true) {
      if (result?.truncated) {
        const expandedMaxTokens = Math.max(options.maxTokens ?? 300, 4000);
        console.log(`[Groq] retrying truncated response once for model ${modelName} with maxTokens=${expandedMaxTokens}`);
        result = await this.generateTextWithModel(prompt, { ...options, maxTokens: expandedMaxTokens });
        return result;
      }

      if (!result?.error) {
        return result;
      }

      const rawErrorText = result.message || '';
      const waitSeconds = GroqLLMProvider.parseRateLimitWaitSeconds(rawErrorText);
      const isTransient = Boolean(result.transientError) || GroqLLMProvider.isTransientError(rawErrorText);

      if (isTransient && retryCount < 3) {
        const waitMs = Math.max(waitSeconds > 0 ? (waitSeconds + 1) * 1000 : 10000, 9000);
        console.log(`[Groq] rate limit/transient error for ${modelName}. Retry ${retryCount + 1}/3 in ${Math.ceil(waitMs / 1000)}s. Error: ${rawErrorText.slice(0, 250)}`);
        await GroqLLMProvider.wait(waitMs);
        retryCount += 1;
        result = await this.generateTextWithModel(prompt, options);
        continue;
      }

      if (result.retryable && retryCount < 1) {
        console.log(`[Groq] retrying invalid/empty response once for model ${modelName}`);
        retryCount += 1;
        result = await this.generateTextWithModel(prompt, options);
        continue;
      }

      return result;
    }
  }

  async generateStructuredOutput(prompt, schema) {
    const schemaDescription = schema
      ? `Return valid JSON only. Keep the response compact. Use only the required keys. Do not include reasoning, markdown, or surrounding text. The keys are: ${Object.keys(schema.properties || {}).join(', ')}.`
      : 'Return valid JSON only. Keep the response compact and do not include reasoning, markdown, or surrounding text.';

    const structuredPrompt = Array.isArray(prompt)
      ? [...prompt, { role: 'user', content: schemaDescription }]
      : [{ role: 'user', content: `${String(prompt || '')}\n${schemaDescription}` }];

    const result = await this.generateText(structuredPrompt, { temperature: 0.1, maxTokens: 800 });

    if (result?.error) {
      return result;
    }

    try {
      const rawText = typeof result.text === 'string'
        ? result.text
        : typeof result.output === 'string'
          ? result.output
          : JSON.stringify(result.output || {});

      const cleanedText = GroqLLMProvider.stripStructuredNoise(rawText);
      const parsed = JSON.parse(cleanedText || '{}');
      return {
        provider: 'groq',
        model: result.modelUsed || this.config.model,
        output: parsed,
        modelUsed: result.modelUsed || this.config.model,
      };
    } catch (error) {
      return {
        provider: 'groq',
        model: result.modelUsed || this.config.model,
        error: true,
        message: 'Groq returned a non-JSON response for structured output.',
        modelUsed: result.modelUsed || this.config.model,
      };
    }
  }
}

function getLLMConfig(overrides = {}) {
  return {
    provider: overrides.provider || process.env.LLM_PROVIDER || 'mock',
    apiKey: overrides.apiKey || process.env.LLM_API_KEY || '',
    model: overrides.model || process.env.LLM_MODEL || 'mock-model',
    baseUrl: overrides.baseUrl || process.env.LLM_BASE_URL || '',
  };
}

function createLLMProvider(overrides = {}) {
  const config = getLLMConfig(overrides);

  if (config.provider === 'groq' && !config.apiKey) {
    return new MockLLMProvider({ ...config, provider: 'mock' });
  }

  switch (config.provider) {
    case 'groq':
      return new GroqLLMProvider(config);
    case 'gemini':
      return new GeminiLLMProvider(config);
    case 'mock':
      return new MockLLMProvider(config);
    default:
      return new MockLLMProvider(config);
  }
}

module.exports = {
  LLMProvider,
  MockLLMProvider,
  GeminiLLMProvider,
  GroqLLMProvider,
  createLLMProvider,
  getLLMConfig,
};

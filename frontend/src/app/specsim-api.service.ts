import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface StartSessionResponse {
  sessionId: string;
  scenarioId: string;
  initialRequest: string;
}

export interface TranscriptEntry {
  role: 'client' | 'developer';
  message: string;
  timestamp?: string;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  transcript: TranscriptEntry[];
}

export interface Requirement {
  id: string;
  requirementName?: string;
  requirementDescription?: string;
  status: 'DISCOVERED' | 'PARTIALLY_DISCOVERED' | 'MISSED';
  evidence?: string | null;
}

export interface UnsupportedAssumption {
  assumption: string;
  explanation: string;
}

export interface EvaluationResponse {
  coverageScore: number;
  requirements: Requirement[];
  unsupportedAssumptions: UnsupportedAssumption[];
  questionQuality: {
    score: number;
    notes: string;
  };
  feedback: string;
  evaluationMode: 'llm' | 'fallback';
}

export interface ScenarioSummary {
  id: string;
  title: string;
  description: string;
  difficulty?: string;
  initialRequest: string;
}

export interface HiddenRequirement {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  evidenceCriteria: string[];
}

export interface ClientPersona {
  role: string;
  businessContext: string;
  communicationStyle: string;
  goals: string[];
  constraints: string[];
  nonNegotiables: string[];
  ambiguityPoints: string[];
}

export interface EvaluationRubricCriterion {
  id: string;
  name: string;
  weight: number;
  description: string;
}

export interface EvaluationRubric {
  rubricVersion: string;
  title: string;
  purpose: string;
  criteria: EvaluationRubricCriterion[];
  scoring: { minimumScore: number; maximumScore: number; passThreshold: number };
  guidance: { highQualityQuestions: string[]; lowQualityQuestions: string[] };
}

export interface ScenarioDetail {
  id: string;
  title: string;
  description: string;
  initialRequest: string;
  difficulty?: string;
  version?: string;
  status?: string;
  hiddenRequirements: HiddenRequirement[];
  clientPersona: ClientPersona;
  evaluationRubric?: EvaluationRubric;
}

export interface ScenarioListResponse {
  scenarios: ScenarioSummary[];
}

export interface ScenarioWritePayload {
  id?: string;
  title: string;
  description: string;
  initialRequest: string;
  difficulty?: string;
  hiddenRequirements: HiddenRequirement[];
  clientPersona: Partial<ClientPersona>;
  evaluationRubric?: EvaluationRubric | null;
}

export interface DeleteScenarioResponse {
  success: boolean;
  deleted: string;
}

export interface ImportItemResult {
  id: string;
  title?: string;
  reason?: string;
}

export interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  createdItems: ImportItemResult[];
  skippedItems: ImportItemResult[];
}

@Injectable({ providedIn: 'root' })
export class SpecsimApiService {
  constructor(private http: HttpClient) {}

  startSession(scenarioId?: string): Observable<StartSessionResponse> {
    return this.http.post<StartSessionResponse>('/api/session/start', scenarioId ? { scenarioId } : {});
  }

  sendMessage(sessionId: string, message: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>('/api/chat', { sessionId, message });
  }

  evaluate(sessionId: string): Observable<EvaluationResponse> {
    return this.http.post<EvaluationResponse>('/api/evaluate', { sessionId });
  }

  listScenarios(): Observable<ScenarioListResponse> {
    return this.http.get<ScenarioListResponse>('/api/scenarios');
  }

  getScenario(id: string): Observable<ScenarioDetail> {
    return this.http.get<ScenarioDetail>(`/api/scenarios/${encodeURIComponent(id)}`);
  }

  createScenario(payload: ScenarioWritePayload): Observable<ScenarioDetail> {
    return this.http.post<ScenarioDetail>('/api/scenarios', payload);
  }

  updateScenario(id: string, payload: Partial<ScenarioWritePayload>): Observable<ScenarioDetail> {
    return this.http.put<ScenarioDetail>(`/api/scenarios/${encodeURIComponent(id)}`, payload);
  }

  deleteScenario(id: string): Observable<DeleteScenarioResponse> {
    return this.http.delete<DeleteScenarioResponse>(`/api/scenarios/${encodeURIComponent(id)}`);
  }

  importScenarios(scenarios: ScenarioWritePayload[]): Observable<ImportResult> {
    return this.http.post<ImportResult>('/api/scenarios/import', { scenarios });
  }
}

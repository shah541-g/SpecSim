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
  status: 'DISCOVERED' | 'PARTIALLY_DISCOVERED' | 'MISSED';
  evidence?: string;
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

@Injectable({ providedIn: 'root' })
export class SpecsimApiService {
  constructor(private http: HttpClient) {}

  startSession(): Observable<StartSessionResponse> {
    return this.http.post<StartSessionResponse>('/api/session/start', {});
  }

  sendMessage(sessionId: string, message: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>('/api/chat', { sessionId, message });
  }

  evaluate(sessionId: string): Observable<EvaluationResponse> {
    return this.http.post<EvaluationResponse>('/api/evaluate', { sessionId });
  }
}

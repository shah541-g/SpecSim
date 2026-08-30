import { Component, ElementRef, signal, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  SpecsimApiService,
  TranscriptEntry,
  EvaluationResponse,
  StartSessionResponse,
  ChatResponse,
} from './specsim-api.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  providers: [SpecsimApiService],
})
export class App implements AfterViewChecked {
  @ViewChild('transcriptBox') private transcriptBox?: ElementRef<HTMLDivElement>;

  protected readonly sessionId = signal<string | null>(null);
  protected readonly scenarioId = signal<string | null>(null);
  protected readonly initialRequest = signal('');
  protected readonly transcript = signal<TranscriptEntry[]>([]);
  protected readonly messageInput = signal('');

  protected readonly loading = signal(false);
  protected readonly evaluating = signal(false);
  protected readonly evaluatingDone = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly evaluation = signal<EvaluationResponse | null>(null);

  private api: SpecsimApiService;

  constructor(api: SpecsimApiService) {
    this.api = api;
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom() {
    try {
      const el = this.transcriptBox?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    } catch {
      /* ignore */
    }
  }

  protected get canSend(): boolean {
    return (
      !!this.sessionId() &&
      !this.loading() &&
      this.messageInput().trim().length > 0
    );
  }

  protected async startSession(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      const res: StartSessionResponse = await firstValueFrom(this.api.startSession());
      this.sessionId.set(res.sessionId);
      this.scenarioId.set(res.scenarioId);
      this.initialRequest.set(res.initialRequest);
      this.transcript.set([{ role: 'client', message: res.initialRequest }]);
      this.evaluatingDone.set(false);
      this.evaluation.set(null);
    } catch (e: any) {
      this.error.set(this.errorMessage(e, 'Failed to start a new session.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async send(): Promise<void> {
    const msg = this.messageInput().trim();
    const sid = this.sessionId();
    if (!msg || !sid || this.loading()) {
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    this.messageInput.set('');
    try {
      const res: ChatResponse = await firstValueFrom(this.api.sendMessage(sid, msg));
      this.transcript.set(res.transcript);
    } catch (e: any) {
      this.error.set(this.errorMessage(e, 'Failed to send your message.'));
      this.messageInput.set(msg);
    } finally {
      this.loading.set(false);
    }
  }

  protected async evaluate(): Promise<void> {
    if (!this.sessionId()) {
      return;
    }
    this.error.set(null);
    this.evaluating.set(true);
    try {
      const res: EvaluationResponse = await firstValueFrom(this.api.evaluate(this.sessionId()!));
      this.evaluation.set(res);
      this.evaluatingDone.set(true);
    } catch (e: any) {
      this.error.set(this.errorMessage(e, 'Failed to evaluate the session.'));
    } finally {
      this.evaluating.set(false);
    }
  }

  protected reset(): void {
    this.sessionId.set(null);
    this.scenarioId.set(null);
    this.initialRequest.set('');
    this.transcript.set([]);
    this.messageInput.set('');
    this.evaluation.set(null);
    this.evaluatingDone.set(false);
    this.error.set(null);
  }

  protected statusClass(status: string): string {
    switch (status) {
      case 'DISCOVERED':
        return 'badge-discovered';
      case 'PARTIALLY_DISCOVERED':
        return 'badge-partial';
      case 'MISSED':
        return 'badge-missed';
      default:
        return '';
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'DISCOVERED':
        return 'Discovered';
      case 'PARTIALLY_DISCOVERED':
        return 'Partially Discovered';
      case 'MISSED':
        return 'Missed';
      default:
        return status;
    }
  }

  private errorMessage(e: any, fallback: string): string {
    const detail = e?.error?.error || e?.error?.details || e?.message;
    if (detail) {
      return `${fallback} ${detail}`;
    }
    return fallback;
  }
}

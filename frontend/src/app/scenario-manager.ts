import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type * as XLSXType from 'xlsx';
import {
  SpecsimApiService,
  ScenarioSummary,
  ScenarioDetail,
  ScenarioWritePayload,
  ScenarioListResponse,
  ImportResult,
  HiddenRequirement,
  ClientPersona,
} from './specsim-api.service';

export interface RequirementEditorRow {
  id: string;
  name: string;
  description: string;
  category: string;
  priority: string;
  evidence: string;
  editing: boolean;
  saved: boolean;
  error: string | null;
}

export interface PersonaEditor {
  role: string;
  businessContext: string;
  communicationStyle: string;
  goals: string;
  constraints: string;
  nonNegotiables: string;
  ambiguityPoints: string;
}

@Component({
  selector: 'app-scenario-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scenario-manager.html',
  styleUrl: './scenario-manager.css',
  providers: [SpecsimApiService],
})
export class ScenarioManager implements OnInit {
  protected readonly scenarios = signal<ScenarioSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly creating = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly detail = signal<ScenarioDetail | null>(null);

  protected readonly importing = signal(false);
  protected readonly importOpen = signal(false);
  protected readonly importError = signal<string | null>(null);
  protected readonly importResult = signal<ImportResult | null>(null);
  protected readonly parsedPreview = signal<ScenarioWritePayload[] | null>(null);
  protected readonly selectedFileName = signal<string | null>(null);

  private readonly TEMPLATE_COLUMNS = [
    'scenario_id',
    'scenario_title',
    'scenario_description',
    'scenario_initialRequest',
    'difficulty',
    'persona_role',
    'persona_businessContext',
    'persona_communicationStyle',
    'persona_goals',
    'persona_constraints',
    'persona_nonNegotiables',
    'persona_ambiguityPoints',
    'req_id',
    'req_name',
    'req_description',
    'req_category',
    'req_priority',
    'req_evidenceCriteria',
  ];

  protected form = {
    id: '',
    title: '',
    description: '',
    initialRequest: '',
    difficulty: 'medium',
    requirements: [] as RequirementEditorRow[],
    persona: {
      role: '',
      businessContext: '',
      communicationStyle: '',
      goals: '',
      constraints: '',
      nonNegotiables: '',
      ambiguityPoints: '',
    } as PersonaEditor,
  };

  constructor(private api: SpecsimApiService) {}

  ngOnInit() {
    this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res: ScenarioListResponse = await firstValueFrom(this.api.listScenarios());
      this.scenarios.set(res.scenarios);
    } catch (e: any) {
      this.error.set(this.errorMessage(e, 'Failed to load scenarios.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected isCreating(): boolean {
    return this.creating();
  }

  protected isEditing(id: string): boolean {
    return this.editingId() === id;
  }

  protected canSave(): boolean {
    return (
      this.form.title.trim().length > 0 &&
      this.form.description.trim().length > 0 &&
      this.form.initialRequest.trim().length > 0 &&
      this.form.requirements.length >= 8 &&
      this.form.requirements.length <= 10 &&
      this.form.persona.role.trim().length > 0
    );
  }

  protected addRequirementRow(): void {
    const cls = ['low', 'medium', 'high', 'critical'];
    const req: RequirementEditorRow = {
      id: `REQ-${String(this.form.requirements.length + 1).padStart(3, '0')}`,
      name: '',
      description: '',
      category: 'general',
      priority: 'medium',
      evidence: '',
      editing: true,
      saved: false,
      error: null,
    };
    this.form.requirements.push(req);
    void cls;
  }

  protected removeRequirementRow(index: number): void {
    this.form.requirements.splice(index, 1);
  }

  protected startCreate(): void {
    this.error.set(null);
    this.creating.set(true);
    this.editingId.set(null);
    this.detail.set(null);
    this.form.id = '';
    this.form.title = '';
    this.form.description = '';
    this.form.initialRequest = '';
    this.form.difficulty = 'medium';
    this.form.requirements = [];
    this.form.persona = {
      role: '',
      businessContext: '',
      communicationStyle: '',
      goals: '',
      constraints: '',
      nonNegotiables: '',
      ambiguityPoints: '',
    };
    this.addRequirementRow();
  }

  protected cancelForm(): void {
    this.creating.set(false);
    this.editingId.set(null);
    this.detail.set(null);
    this.error.set(null);
  }

  protected async edit(id: string): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      const d: ScenarioDetail = await firstValueFrom(this.api.getScenario(id));
      this.detail.set(d);
      this.creating.set(false);
      this.editingId.set(id);
      this.form.id = d.id;
      this.form.title = d.title;
      this.form.description = d.description;
      this.form.initialRequest = d.initialRequest;
      this.form.difficulty = d.difficulty || 'medium';
      this.form.requirements = d.hiddenRequirements.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        category: r.category,
        priority: r.priority,
        evidence: (r.evidenceCriteria || []).join('\n'),
        editing: false,
        saved: true,
        error: null,
      }));
      this.form.persona = {
        role: d.clientPersona?.role || '',
        businessContext: d.clientPersona?.businessContext || '',
        communicationStyle: d.clientPersona?.communicationStyle || '',
        goals: (d.clientPersona?.goals || []).join('\n'),
        constraints: (d.clientPersona?.constraints || []).join('\n'),
        nonNegotiables: (d.clientPersona?.nonNegotiables || []).join('\n'),
        ambiguityPoints: (d.clientPersona?.ambiguityPoints || []).join('\n'),
      };
    } catch (e: any) {
      this.error.set(this.errorMessage(e, 'Failed to load scenario.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      this.error.set('Please fill in title, description, opening request, 8-10 requirements, and a persona role.');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      const payload = this.buildPayload();
      if (this.creating()) {
        await firstValueFrom(this.api.createScenario(payload));
      } else if (this.editingId()) {
        const id = this.editingId()!;
        const detail = this.detail();
        const putPayload: Partial<ScenarioWritePayload> = {
          title: payload.title,
          description: payload.description,
          initialRequest: payload.initialRequest,
          difficulty: payload.difficulty,
          hiddenRequirements: payload.hiddenRequirements,
          clientPersona: payload.clientPersona,
        };
        if (detail?.evaluationRubric) {
          putPayload.evaluationRubric = detail.evaluationRubric;
        }
        await firstValueFrom(this.api.updateScenario(id, putPayload));
      }
      this.cancelForm();
      await this.refresh();
    } catch (e: any) {
      this.error.set(this.errorMessage(e, 'Failed to save scenario.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(id: string): Promise<void> {
    const confirmed = window.confirm(
      `Delete scenario "${id}"? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    try {
      await firstValueFrom(this.api.deleteScenario(id));
      if (this.editingId() === id) {
        this.cancelForm();
      }
      await this.refresh();
    } catch (e: any) {
      this.error.set(this.errorMessage(e, 'Failed to delete scenario.'));
    } finally {
      this.loading.set(false);
    }
  }

  private buildPayload(): ScenarioWritePayload {
    const requirements: HiddenRequirement[] = this.form.requirements.map((r, i) => ({
      id: r.id || `REQ-${String(i + 1).padStart(3, '0')}`,
      name: r.name,
      description: r.description,
      category: r.category,
      priority: (['low', 'medium', 'high', 'critical'].includes(r.priority)
        ? r.priority
        : 'medium') as HiddenRequirement['priority'],
      evidenceCriteria: r.evidence
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }));
    const persona: Partial<ClientPersona> = {
      role: this.form.persona.role,
      businessContext: this.form.persona.businessContext,
      communicationStyle: this.form.persona.communicationStyle,
      goals: this.splitLines(this.form.persona.goals),
      constraints: this.splitLines(this.form.persona.constraints),
      nonNegotiables: this.splitLines(this.form.persona.nonNegotiables),
      ambiguityPoints: this.splitLines(this.form.persona.ambiguityPoints),
    };
    const payload: ScenarioWritePayload = {
      id: this.form.id.trim() || undefined,
      title: this.form.title,
      description: this.form.description,
      initialRequest: this.form.initialRequest,
      difficulty: this.form.difficulty || undefined,
      hiddenRequirements: requirements,
      clientPersona: persona,
    };
    return payload;
  }

  private splitLines(value: string): string[] {
    return value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private splitPipe(value: string): string[] {
    return (value || '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private slugifyId(value: string): string {
    const slug = (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug;
  }

  protected async downloadTemplate(): Promise<void> {
    const XLSX = await import('xlsx');

    const t = (v: string) => ({
      'scenario_id': 'demo',
      'scenario_title': 'Demo scenario',
      'scenario_description': 'Describe the business problem this scenario should help the developer uncover.',
      'scenario_initialRequest': 'We are growing and the current way of managing things is becoming difficult.',
      'difficulty': 'medium',
      'persona_role': 'Owner of the business',
      'persona_businessContext': 'A short overview of the business and its operations.',
      'persona_communicationStyle': 'Pragmatic and concise.',
      'persona_goals': 'Goal one|Goal two',
      'persona_constraints': 'Constraint one|Constraint two',
      'persona_nonNegotiables': 'Non-negotiable one|Non-negotiable two',
      'persona_ambiguityPoints': 'Undecided detail one|Undecided detail two',
      'req_id': `REQ-${v}-001`,
      'req_name': 'Requirement name',
      'req_description': 'The hidden need the developer must uncover.',
      'req_category': 'operations',
      'req_priority': 'high',
      'req_evidenceCriteria': 'Developer asks about X|Developer mentions Y',
    });

    const rows = [];
    for (let r = 1; r <= 8; r += 1) {
      const row = t(String(r).padStart(2, '0'));
      row['req_id'] = `REQ-${String(r).padStart(3, '0')}`;
      row['req_name'] = `Example requirement ${r}`;
      rows.push(row);
    }

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: this.TEMPLATE_COLUMNS });
    worksheet['!cols'] = this.TEMPLATE_COLUMNS.map(() => ({ wch: 24 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Scenarios');
    XLSX.writeFile(workbook, 'specsim-scenario-template.xlsx');
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    this.importError.set(null);
    if (!file) {
      this.selectedFileName.set(null);
      this.parsedPreview.set(null);
      return;
    }
    this.selectedFileName.set(file.name);
    try {
      const scenarios = await this.parseSheetData(file);
      this.parsedPreview.set(scenarios);
    } catch (e: any) {
      this.importError.set(e?.message || 'Could not parse the uploaded sheet.');
      this.parsedPreview.set(null);
    }
  }

  private async parseSheetData(file: File): Promise<ScenarioWritePayload[]> {
    const XLSX = await import('xlsx');
    let workbook: XLSXType.WorkBook;
    try {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(buffer, { type: 'array', raw: true });
    } catch (e: any) {
      throw new Error(`Unable to read the file as a spreadsheet: ${e?.message || 'unknown error'}`);
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('The uploaded file contains no sheets.');
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

    const groupRows = rows
      .map((row) => Object.fromEntries(
        this.TEMPLATE_COLUMNS.map((col) => [col, row[col] ?? ''])
      ))
      .filter((row) => String(row['scenario_id'] || '').trim() !== '');

    if (groupRows.length === 0) {
      throw new Error('No scenario rows found. Make sure the sheet has a scenario_id column with values.');
    }

    const grouped = new Map<string, Record<string, any>[]>();
    for (const row of groupRows) {
      const key = String(row['scenario_id']).trim();
      const arr = grouped.get(key) || [];
      arr.push(row);
      grouped.set(key, arr);
    }

    const scenarios: ScenarioWritePayload[] = [];
    let sequence = 1;
    for (const [key, sgRows] of grouped) {
      const first = sgRows[0];
      const id = this.slugifyId(key) || `imported-${sequence}`;
      const requirements: HiddenRequirement[] = sgRows.map((row, i) => ({
        id: String(row['req_id'] || `REQ-${String(i + 1).padStart(3, '0')}`).trim(),
        name: String(row['req_name'] || '').trim(),
        description: String(row['req_description'] || '').trim(),
        category: String(row['req_category'] || 'general').trim(),
        priority: (['low', 'medium', 'high', 'critical'].includes(String(row['req_priority']).trim())
          ? String(row['req_priority']).trim()
          : 'medium') as HiddenRequirement['priority'],
        evidenceCriteria: this.splitPipe(String(row['req_evidenceCriteria']).trim()),
      })).filter((r) => r.name !== '');

      if (requirements.length < 8 || requirements.length > 10) {
        throw new Error(`Scenario "${id}" has ${requirements.length} requirements. Each scenario needs 8-10 with a req_name filled in.`);
      }

      const persona: Partial<ClientPersona> = {
        role: String(first['persona_role'] || '').trim(),
        businessContext: String(first['persona_businessContext'] || '').trim(),
        communicationStyle: String(first['persona_communicationStyle'] || '').trim(),
        goals: this.splitPipe(String(first['persona_goals']).trim()),
        constraints: this.splitPipe(String(first['persona_constraints']).trim()),
        nonNegotiables: this.splitPipe(String(first['persona_nonNegotiables']).trim()),
        ambiguityPoints: this.splitPipe(String(first['persona_ambiguityPoints']).trim()),
      };

      scenarios.push({
        id,
        title: String(first['scenario_title'] || '').trim(),
        description: String(first['scenario_description'] || '').trim(),
        initialRequest: String(first['scenario_initialRequest'] || '').trim(),
        difficulty: String(first['difficulty'] || '').trim() || undefined,
        hiddenRequirements: requirements,
        clientPersona: persona,
      });
      sequence += 1;
    }

    return scenarios;
  }

  protected async importFromSheet(): Promise<void> {
    const scenarios = this.parsedPreview();
    this.importError.set(null);
    this.importResult.set(null);
    if (!scenarios || scenarios.length === 0) {
      this.importError.set('Select a sheet first, then import.');
      return;
    }
    this.importing.set(true);
    try {
      const res: ImportResult = await firstValueFrom(this.api.importScenarios(scenarios));
      this.importResult.set(res);
      await this.refresh();
    } catch (e: any) {
      this.importError.set(this.errorMessage(e, 'Import failed.'));
    } finally {
      this.importing.set(false);
    }
  }

  protected resetImport(): void {
    this.importError.set(null);
    this.importResult.set(null);
    this.parsedPreview.set(null);
    this.selectedFileName.set(null);
  }

  private errorMessage(e: any, fallback: string): string {
    const detail = e?.error?.error || e?.error?.details || e?.message;
    if (detail) {
      return `${fallback} ${detail}`;
    }
    return fallback;
  }
}

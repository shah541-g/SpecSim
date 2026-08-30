import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { SpecsimApiService } from './specsim-api.service';

describe('App', () => {
  beforeEach(async () => {
    const apiStub = {
      listScenarios: jasmine
        .createSpy('listScenarios')
        .and.returnValue(
          of({
            scenarios: [
              { id: 'pharmacy-management-system', title: 'Pharmacy Management System', description: 'A pharmacy scenario', difficulty: 'medium', initialRequest: 'I need a pharmacy system.' },
            ],
          })
        ),
      startSession: jasmine.createSpy('startSession').and.returnValue(of({})),
    };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: SpecsimApiService, useValue: apiStub }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the difficulty picker and a scenario card', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.difficulty-picker')).toBeTruthy();
    expect(compiled.querySelector('.scenario-pick')).toBeTruthy();
  });
});

'use client';

import { Email } from '@/types';
import { ALL_PHASES, PHASE_MAP, classifyEmail, isTRTEmail, NEXT_PHASE, PHASE_EXPLANATIONS } from '@/lib/phases';

interface HearingData {
  dataAudiencia: string;
  horario: string;
  reclamante: string;
  reclamada: string;
  numeroProcesso: string;
  orgaoJulgador: string;
  tipoAudiencia: string;
  advogado: string;
  isFuture: boolean;
}

interface EmailTimelineProps {
  emails: Email[];
  hearings?: HearingData[];
  clientProcessNumber?: string;
}

function formatDateBR(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function EmailTimeline({ emails, hearings = [], clientProcessNumber }: EmailTimelineProps) {
  if (!emails || emails.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <div className="empty-state-title">Nenhuma movimentação encontrada</div>
        <div className="empty-state-desc">
          Ainda não foram encontradas notificações do tribunal para este cliente.
        </div>
      </div>
    );
  }

  // Classify emails
  const phaseEmails: Record<string, Email[]> = {};

  for (const email of emails) {
    const phase = classifyEmail(email);

    if (phase) {
      if (!phaseEmails[phase.id]) phaseEmails[phase.id] = [];
      phaseEmails[phase.id].push(email);
    } else if (isTRTEmail(email)) {
      if (!phaseEmails['distribuicao']) phaseEmails['distribuicao'] = [];
      phaseEmails['distribuicao'].push(email);
    }
  }

  // Build completed phases in order
  const completedPhases: { id: string; name: string; simple: string; date: string }[] = [];
  const activeIds = new Set(Object.keys(phaseEmails));

  // Walk through ALL_PHASES in order, pick only those with emails
  for (const phase of ALL_PHASES) {
    if (activeIds.has(phase.id)) {
      const firstEmail = phaseEmails[phase.id][0];
      completedPhases.push({
        id: phase.id,
        name: phase.name,
        simple: phase.simple,
        date: formatDateBR(firstEmail.date),
      });
    }
  }

  // Current phase = last completed (from emails only)
  let currentPhase = completedPhases[completedPhases.length - 1];

  // --- Hearing (audiência) data from spreadsheet ---
  const pastHearings = hearings.filter((h) => !h.isFuture);
  const futureHearings = hearings.filter((h) => h.isFuture);
  const hasPastHearing = pastHearings.length > 0;
  const hasFutureHearing = futureHearings.length > 0;

  // --- SMART PHASE OVERRIDE ---
  // Priority: Future hearing > Past hearing (if no advanced phase) > Email phase
  // A future hearing is ALWAYS the most relevant info for the client.
  const advancedPhases = ['sentenca', 'acordao', 'recurso', 'execucao', 'transito', 'arquivamento'];
  const phaseFromEmails = currentPhase?.id;

  // Determine effective phase considering hearings
  let effectivePhaseId = phaseFromEmails;
  let effectivePhaseName = currentPhase?.name || 'Não identificada';
  let effectivePhaseSimple = currentPhase?.simple || '';

  if (hasFutureHearing) {
    // FUTURE HEARING = ALWAYS the current phase (most actionable info)
    const nextHearing = futureHearings[0];
    effectivePhaseId = 'audiencia_marcada';
    effectivePhaseName = `Audiência Marcada${nextHearing.tipoAudiencia ? ` (${nextHearing.tipoAudiencia})` : ''}`;
    effectivePhaseSimple = `Audiência agendada para ${nextHearing.dataAudiencia}${nextHearing.horario ? ` às ${nextHearing.horario}` : ''} — o cliente deve comparecer`;
  } else if (hasPastHearing && (!phaseFromEmails || !advancedPhases.includes(phaseFromEmails))) {
    // Past hearing + no advanced phase = waiting for sentença
    effectivePhaseId = 'pos_audiencia';
    effectivePhaseName = 'Aguardando Sentença';
    effectivePhaseSimple = 'A audiência já foi realizada — aguardando decisão do juiz';
  }

  // Next expected phase
  let nextPhaseId: string | undefined;
  let nextPhase = undefined;

  if (effectivePhaseId === 'pos_audiencia') {
    nextPhase = PHASE_MAP.get('sentenca');
  } else if (effectivePhaseId === 'audiencia_marcada') {
    // Next after hearing is sentença
    nextPhaseId = 'sentenca';
    nextPhase = PHASE_MAP.get('sentenca');
  } else {
    nextPhaseId = currentPhase ? NEXT_PHASE[currentPhase.id] : undefined;
    nextPhase = nextPhaseId ? PHASE_MAP.get(nextPhaseId) : undefined;
  }

  // Process number — prefer the one from the client record (correct for this specific process)
  const processNumber = clientProcessNumber || emails.find((e) => e.processNumber)?.processNumber;

  // Current phase color
  const getPhaseColor = (id: string) => {
    if (['sentenca', 'acordao', 'transito'].includes(id)) return '#10b981';
    if (['audiencia_inicial', 'audiencia_una', 'audiencia_instrucao', 'audiencia_marcada'].includes(id)) return '#f59e0b';
    if (['recurso'].includes(id)) return '#ef4444';
    if (['execucao'].includes(id)) return '#f97316';
    if (id === 'pos_audiencia') return '#8b5cf6';
    return '#3b82f6';
  };

  const currentColor = getPhaseColor(effectivePhaseId || '');

  // --- Build smart explanation based on ALL available data ---
  let explanation = currentPhase ? PHASE_EXPLANATIONS[currentPhase.id] : undefined;

  // Override explanation if hearings data gives us better info
  if (effectivePhaseId === 'pos_audiencia' && pastHearings.length > 0) {
    const lastHearing = pastHearings[pastHearings.length - 1];
    explanation = {
      titulo: 'Audiência Realizada — Aguardando Sentença',
      oQueAconteceu: `A audiência${lastHearing.tipoAudiencia ? ` (${lastHearing.tipoAudiencia})` : ''} foi realizada em ${lastHearing.dataAudiencia}${lastHearing.horario ? ` às ${lastHearing.horario}` : ''}${lastHearing.orgaoJulgador ? ` perante ${lastHearing.orgaoJulgador}` : ''}.${lastHearing.advogado ? ` O advogado ${lastHearing.advogado} representou o escritório.` : ''} O juiz já ouviu as partes e, se houve instrução, também as testemunhas.`,
      oQueEsperar: 'O juiz agora vai analisar as provas e argumentos apresentados para proferir a sentença. A sentença pode sair na própria audiência, em poucos dias, ou em até 30 dias.',
      prazo: 'A sentença costuma ser publicada entre 5 e 30 dias após a audiência de instrução. Se foi audiência de conciliação sem acordo, pode haver uma nova audiência de instrução.',
      acaoNecessaria: 'Aguardar a publicação da sentença. O advogado acompanha o andamento no sistema do tribunal.',
    };
  } else if (effectivePhaseId === 'audiencia_marcada' && futureHearings.length > 0) {
    const nextHearing = futureHearings[0];
    explanation = {
      titulo: 'Audiência Agendada',
      oQueAconteceu: `O processo está em andamento e uma audiência${nextHearing.tipoAudiencia ? ` de ${nextHearing.tipoAudiencia}` : ''} foi marcada para ${nextHearing.dataAudiencia}${nextHearing.horario ? ` às ${nextHearing.horario}` : ''}${nextHearing.orgaoJulgador ? ` na ${nextHearing.orgaoJulgador}` : ''}.`,
      oQueEsperar: 'Na audiência, o juiz pode propor um acordo entre as partes. Se não houver acordo, serão ouvidas as testemunhas e produzidas as provas. Após isso, o juiz terá elementos para proferir a sentença.',
      prazo: `A audiência está marcada para ${nextHearing.dataAudiencia}${nextHearing.horario ? ` às ${nextHearing.horario}` : ''}. Chegar com antecedência de pelo menos 15 minutos.`,
      acaoNecessaria: `⚠️ IMPORTANTE: O cliente DEVE comparecer à audiência no dia ${nextHearing.dataAudiencia}. A ausência pode resultar em arquivamento do processo. Levar documento de identidade e testemunhas combinadas com o advogado.`,
    };
  }

  return (
    <div>
      {/* ======= CURRENT PHASE - BIG AND CLEAR ======= */}
      <div style={{
        background: `linear-gradient(135deg, ${currentColor}15, ${currentColor}08)`,
        border: `1px solid ${currentColor}30`,
        borderRadius: '1rem',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 700 }}>
          📍 Fase Atual do Processo
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: currentColor, marginBottom: '0.5rem' }}>
          {effectivePhaseName}
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
          {effectivePhaseSimple}
        </div>

        {processNumber && (
          <div style={{
            display: 'inline-block', marginTop: '1rem',
            padding: '0.35rem 1rem', borderRadius: '999px',
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
            fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-purple-light)',
          }}>
            Nº {processNumber}
          </div>
        )}
      </div>

      {/* ======= HEARINGS FROM SPREADSHEET ======= */}
      {hearings.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          {hearings.map((h, idx) => (
            <div key={idx} style={{
              background: h.isFuture
                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.04))'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04))',
              border: `1px solid ${h.isFuture ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
              borderRadius: '1rem',
              padding: '1.25rem 1.5rem',
              marginBottom: '0.75rem',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem',
                fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em',
                fontWeight: 700, color: h.isFuture ? '#f59e0b' : '#10b981',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {h.isFuture ? '📅 Audiência Marcada' : '✅ Audiência Realizada'}
                {h.tipoAudiencia && (
                  <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                    {h.tipoAudiencia}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                {h.dataAudiencia && (
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                      Data
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: h.isFuture ? '#f59e0b' : '#10b981' }}>
                      {h.dataAudiencia}
                    </div>
                  </div>
                )}
                {h.horario && (
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                      Horário
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: h.isFuture ? '#f59e0b' : '#10b981' }}>
                      {h.horario}
                    </div>
                  </div>
                )}
                {h.orgaoJulgador && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                      Órgão Julgador
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {h.orgaoJulgador}
                    </div>
                  </div>
                )}
                {h.advogado && (
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                      Advogado
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {h.advogado}
                    </div>
                  </div>
                )}
                {h.reclamada && (
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                      Reclamada
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {h.reclamada}
                    </div>
                  </div>
                )}
                {h.numeroProcesso && (
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                      Processo
                    </div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-purple, #8b5cf6)', fontFamily: 'monospace' }}>
                      {h.numeroProcesso}
                    </div>
                  </div>
                )}
              </div>

              {h.isFuture && (
                <div style={{
                  marginTop: '1rem', padding: '0.6rem 0.75rem',
                  background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: '0.5rem', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600,
                }}>
                  ⚠️ O cliente DEVE comparecer! A ausência pode resultar em arquivamento do processo.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ======= DETAILED EXPLANATION CARD ======= */}
      {explanation && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: currentColor, fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={currentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Entenda o que está acontecendo
          </div>

          {/* O que aconteceu */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
              📋 O que aconteceu
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {explanation.oQueAconteceu}
            </div>
          </div>

          {/* O que esperar */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
              🔮 O que esperar agora
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {explanation.oQueEsperar}
            </div>
          </div>

          {/* Prazo estimado */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
              ⏱️ Prazo estimado
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {explanation.prazo}
            </div>
          </div>

          {/* Ação necessária */}
          <div style={{
            padding: '0.75rem 1rem',
            background: explanation.acaoNecessaria.includes('IMPORTANTE') ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
            border: `1px solid ${explanation.acaoNecessaria.includes('IMPORTANTE') ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
            borderRadius: '0.5rem',
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: explanation.acaoNecessaria.includes('IMPORTANTE') ? '#f59e0b' : '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
              ✅ Ação necessária
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6, fontWeight: 500 }}>
              {explanation.acaoNecessaria}
            </div>
          </div>
        </div>
      )}

      {/* ======= NEXT STEP ======= */}
      {nextPhase && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px dashed rgba(255,255,255,0.15)',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '0.75rem',
        }}>
          <div style={{
            width: '2.25rem', height: '2.25rem', borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '2px dashed rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem', flexShrink: 0,
          }}>
            ⏳
          </div>
          <div>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
              Próximo passo esperado
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {nextPhase.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {nextPhase.simple}
            </div>
          </div>
        </div>
      )}

      {/* ======= WHAT ALREADY HAPPENED ======= */}
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.75rem' }}>
        📋 O que já aconteceu
      </div>

      {completedPhases.map((phase, index) => {
        const isLast = index === completedPhases.length - 1;
        const color = isLast ? currentColor : '#10b981';

        return (
          <div key={phase.id} style={{ display: 'flex', gap: '0.75rem', position: 'relative' }}>
            {/* Line + dot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '1.75rem', flexShrink: 0 }}>
              <div style={{
                width: '1.75rem', height: '1.75rem', borderRadius: '50%',
                background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', color: '#fff', fontWeight: 800, zIndex: 1,
                boxShadow: isLast ? `0 0 12px ${color}40` : 'none',
              }}>
                {isLast ? '●' : '✓'}
              </div>
              {!isLast && (
                <div style={{ width: '2px', flex: 1, background: '#10b981', minHeight: '1rem' }} />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: isLast ? color : 'var(--text-primary)' }}>
                  {phase.name}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  — {phase.date}
                </span>
                {isLast && (
                  <span style={{
                    fontSize: '0.5rem', padding: '0.1rem 0.4rem', borderRadius: '999px',
                    background: `${color}20`, color, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    Atual
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                {phase.simple}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

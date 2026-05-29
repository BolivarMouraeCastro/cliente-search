'use client';

import { Email } from '@/types';
import { ALL_PHASES, PHASE_MAP, classifyEmail, isTRTEmail, NEXT_PHASE, PHASE_EXPLANATIONS } from '@/lib/phases';

interface EmailTimelineProps {
  emails: Email[];
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
export default function EmailTimeline({ emails }: EmailTimelineProps) {
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

  // Current phase = last completed
  const currentPhase = completedPhases[completedPhases.length - 1];

  // Next expected phase
  const nextPhaseId = currentPhase ? NEXT_PHASE[currentPhase.id] : undefined;
  const nextPhase = nextPhaseId ? PHASE_MAP.get(nextPhaseId) : undefined;

  // Process number
  const processNumber = emails.find((e) => e.processNumber)?.processNumber;

  // Current phase color
  const getPhaseColor = (id: string) => {
    if (['sentenca', 'acordao', 'transito'].includes(id)) return '#10b981';
    if (['audiencia_inicial', 'audiencia_una', 'audiencia_instrucao'].includes(id)) return '#f59e0b';
    if (['recurso'].includes(id)) return '#ef4444';
    if (['execucao'].includes(id)) return '#f97316';
    return '#3b82f6';
  };

  const currentColor = currentPhase ? getPhaseColor(currentPhase.id) : '#3b82f6';

  // Detailed explanation for the current phase
  const explanation = currentPhase ? PHASE_EXPLANATIONS[currentPhase.id] : undefined;

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
          {currentPhase?.name || 'Não identificada'}
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
          {currentPhase?.simple || ''}
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

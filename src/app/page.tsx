'use client';

import { useState, useEffect, useCallback } from 'react';
import SearchBar from '@/components/SearchBar';
import ClientCard from '@/components/ClientCard';
import { Client } from '@/types';

const RECENT_SEARCHES_KEY = 'bmc_recent';
const MAX_RECENT = 6;

function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  if (!query.trim()) return;
  try {
    const recent = getRecentSearches().filter((s) => s !== query);
    recent.unshift(query);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT))
    );
  } catch { /* ignore */ }
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    setQuery(searchQuery);
    if (!searchQuery.trim()) {
      setClients([]);
      setHasSearched(false);
      return;
    }
    setIsLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/clients?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
        saveRecentSearch(searchQuery);
        setRecentSearches(getRecentSearches());
      } else { setClients([]); }
    } catch { setClients([]); }
    finally { setIsLoading(false); }
  }, []);

  const handleRecentClick = (search: string) => {
    setQuery(search);
    handleSearch(search);
  };

  return (
    <div className="detail-page">
      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">BM&C</h1>
        <p className="hero-subtitle">Gestão Inteligente de Clientes</p>
      </section>

      {/* Search */}
      <SearchBar onSearch={handleSearch} isLoading={isLoading} value={query} />

      {/* Recent Searches */}
      {!hasSearched && recentSearches.length > 0 && (
        <div className="recent-searches">
          <div className="recent-searches-title">Buscas recentes</div>
          <div className="recent-searches-list">
            {recentSearches.map((search, i) => (
              <button key={i} className="recent-search-chip" onClick={() => handleRecentClick(search)}>
                {search}
              </button>
            ))}
          </div>
        </div>
      )}



      {/* Search Loading */}
      {isLoading && (
        <div className="clients-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="shimmer shimmer-card" />
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && hasSearched && (
        <>
          <div className="results-header">
            <span className="results-title">Resultados</span>
            <span className="results-count">
              {clients.length} {clients.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}
            </span>
          </div>

          {clients.length > 0 ? (
            <div className="clients-grid">
              {clients.map((client, index) => (
                <div key={client.id} style={{ animationDelay: `${index * 0.05}s` }}>
                  <ClientCard client={client} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <div className="empty-state-title">Nenhum cliente encontrado</div>
              <div className="empty-state-desc">
                Tente buscar por nome, empresa ou número do processo.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

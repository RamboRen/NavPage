import type { FormEvent, RefObject } from 'react';
import type { SearchEngine } from '../types';
import { SearchIcon } from './icons';
import styles from './SearchBar.module.css';

export interface SearchBarProps {
  engines: SearchEngine[];
  engineId: string;
  onEngineChange: (id: string) => void;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function SearchBar({
  engines,
  engineId,
  onEngineChange,
  value,
  onChange,
  onSubmit,
  inputRef
}: SearchBarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form className={styles.searchbar} onSubmit={handleSubmit} role="search">
      <label className={styles.engine}>
        <select
          className={styles.select}
          value={engineId}
          onChange={(event) => onEngineChange(event.target.value)}
          aria-label="选择搜索引擎"
        >
          {engines.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.name}
            </option>
          ))}
        </select>
      </label>

      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索，或输入关键词筛选下方导航…"
        aria-label="搜索关键词"
        autoComplete="off"
      />

      <button className={styles.submit} type="submit" aria-label="搜索">
        <SearchIcon />
      </button>
      <kbd className={styles.kbd}>/</kbd>
    </form>
  );
}

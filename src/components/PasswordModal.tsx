import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../store/AuthStore';
import { CloseIcon, LockIcon } from './icons';
import { useToast } from './Toast';
import styles from './PasswordModal.module.css';

interface PasswordModalProps {
  open: boolean;
  onClose: () => void;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : '修改失败，请稍后重试');

export function PasswordModal({ open, onClose }: PasswordModalProps) {
  const { actions } = useAuth();
  const notify = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setError('');
    if (!current) {
      setError('请输入当前密码');
      return;
    }
    if (next.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (next !== confirm) {
      setError('两次输入的新密码不一致');
      return;
    }

    setBusy(true);
    try {
      await actions.changePassword(current, next);
      notify('密码已更新');
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="password-modal-title">
      <button className={styles.mask} type="button" aria-label="关闭" onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.head}>
          <div>
            <h3 id="password-modal-title">修改密码</h3>
            <p className={styles.sub}>修改后，其它设备上的登录状态会失效</p>
          </div>
          <button className="icon-btn icon-btn--ghost" type="button" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>当前密码</span>
            <div className={styles.inputWrap}>
              <LockIcon />
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                placeholder="用于确认是本人操作"
                autoFocus
              />
            </div>
          </label>

          <label className={styles.field}>
            <span>新密码</span>
            <div className={styles.inputWrap}>
              <LockIcon />
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                placeholder="至少 6 位"
              />
            </div>
          </label>

          <label className={styles.field}>
            <span>确认新密码</span>
            <div className={styles.inputWrap}>
              <LockIcon />
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="再输入一次"
              />
            </div>
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.foot}>
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存新密码'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { UserAccount } from '../types';
import { ChevronIcon, KeyIcon, LogoutIcon, UsersIcon } from './icons';
import styles from './UserMenu.module.css';

interface UserMenuProps {
  user: UserAccount;
  onChangePassword: () => void;
  onManageUsers: () => void;
  onLogout: () => void;
}

/** 按账号名生成稳定的头像色相，同一账号每次登录颜色一致 */
const hueOf = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
};

const initialOf = (user: UserAccount) => [...(user.displayName || user.username)][0]?.toUpperCase() ?? 'N';

export function UserMenu({ user, onChangePassword, onManageUsers, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === 'admin';

  useEffect(() => {
    if (!open) return;

    const handlePointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const hue = hueOf(user.username);
  const avatarStyle = {
    backgroundImage: `linear-gradient(135deg, hsl(${hue} 76% 62%), hsl(${(hue + 46) % 360} 72% 54%))`
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${user.displayName}（@${user.username}）`}
      >
        <span className={styles.avatar} style={avatarStyle} aria-hidden="true">
          {initialOf(user)}
        </span>
        <span className={styles.name}>{user.displayName}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">
          <ChevronIcon size={12} />
        </span>
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.head}>
            <span className={`${styles.avatar} ${styles.avatarLg}`} style={avatarStyle} aria-hidden="true">
              {initialOf(user)}
            </span>
            <div className={styles.headText}>
              <strong>{user.displayName}</strong>
              <small>@{user.username}</small>
            </div>
            {isAdmin && <span className={styles.roleChip}>管理员</span>}
          </div>

          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                onManageUsers();
              }}
            >
              <UsersIcon size={15} />
              账号管理
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              onChangePassword();
            }}
          >
            <KeyIcon size={15} />
            修改密码
          </button>

          <button
            type="button"
            role="menuitem"
            className={`${styles.item} ${styles.danger}`}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogoutIcon size={15} />
            退出登录
          </button>

          <p className={styles.hint}>
            {isAdmin ? '你是超级管理员，可在「账号管理」中开通或停用账号' : '数据按账号隔离，退出后可用其它账号登录'}
          </p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../store/AuthStore';
import { EyeIcon, EyeOffIcon, LockIcon, UserIcon } from './icons';
import styles from './AuthPage.module.css';

const errorText = (error: unknown) => (error instanceof Error ? error.message : '操作失败，请稍后重试');
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5-]{2,20}$/;
/** 记住上次登录的账号名（只是方便下次输入，不含密码） */
const LAST_USER_KEY = 'nv:last-username';

const readLastName = () => {
  try {
    return window.localStorage.getItem(LAST_USER_KEY) || '';
  } catch {
    return '';
  }
};

const saveLastName = (name: string) => {
  try {
    if (name) window.localStorage.setItem(LAST_USER_KEY, name);
    else window.localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* 隐私模式下写入失败，忽略即可 */
  }
};

/**
 * 登录页
 * ------------------------------------------------------------------
 * · 系统不开放注册：只有「一个账号都没有」的全新实例才显示初始化表单
 * · 之后的账号全部由超级管理员在「管理 → 用户」里创建
 * · 「记住登录状态」勾选后服务端下发持久 Cookie，否则关闭浏览器即退出
 */
export function AuthPage() {
  const { state, actions } = useAuth();
  const setup = !state.hasUsers;
  const rememberDays = state.session?.rememberDays ?? 30;
  const [username, setUsername] = useState(readLastName);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 登录页没有账号数据，先跟随系统深浅色
  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const name = username.trim();
    setError('');

    if (!name) {
      setError('请输入账号');
      return;
    }
    if (setup && !USERNAME_RE.test(name)) {
      setError('账号需为 2-20 位字母、数字、下划线、短横线或中文');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (setup && password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }

    setBusy(true);
    try {
      if (setup) {
        await actions.bootstrapAdmin(name, password);
        saveLastName(name);
      } else {
        await actions.login(name, password, remember);
        saveLastName(remember ? name : '');
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.blobs} aria-hidden="true">
        <span className={`${styles.blob} ${styles.blobA}`} />
        <span className={`${styles.blob} ${styles.blobB}`} />
        <span className={`${styles.blob} ${styles.blobC}`} />
      </div>

      <div className={styles.shell}>
        <section className={styles.intro}>
          <div className={styles.brand}>
            <span className={styles.mark}>N</span>
            <span>
              <strong>NavPage</strong>
              <small>干净地开始每一次上网</small>
            </span>
          </div>

          <h1>
            一个账号，
            <br />
            一套属于你的导航。
          </h1>
          <p className={styles.lead}>登录后，收藏、分类、搜索引擎和外观都按账号分开保存，互不干扰。</p>

          <ul className={styles.points}>
            <li>
              <span className={styles.pointIcon}>🗂️</span>
              <div>
                <strong>数据按账号隔离</strong>
                <small>换个人登录，看到的就是他自己的那套导航</small>
              </div>
            </li>
            <li>
              <span className={styles.pointIcon}>🔑</span>
              <div>
                <strong>账号由管理员分配</strong>
                <small>不开放自助注册，避免陌生人占用实例</small>
              </div>
            </li>
            <li>
              <span className={styles.pointIcon}>🔒</span>
              <div>
                <strong>密码只存哈希</strong>
                <small>scrypt 加盐存储，会话放在 HttpOnly Cookie 里</small>
              </div>
            </li>
          </ul>
        </section>

        <section className={styles.card}>
          <span className={styles.eyebrow}>{setup ? '首次部署' : '账号登录'}</span>

          <div className={styles.cardHead}>
            <h2>{setup ? '创建超级管理员' : '欢迎回来'}</h2>
            <p>
              {setup
                ? '这个账号拥有账号管理权限，创建后系统即关闭注册入口。'
                : '登录后继续使用你的收藏与分类。账号需要管理员开通。'}
            </p>
          </div>

          {state.expired && !setup && (
            <p className={styles.notice} role="status">
              登录状态已失效（会话过期或密码被重置），请重新登录。
            </p>
          )}

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>账号</span>
              <div className={styles.inputWrap}>
                <UserIcon />
                <input
                  name="username"
                  autoComplete="username"
                  autoFocus
                  placeholder={setup ? '例如：admin' : '请输入账号'}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
            </label>

            <label className={styles.field}>
              <span>密码</span>
              <div className={styles.inputWrap}>
                <LockIcon />
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={setup ? 'new-password' : 'current-password'}
                  placeholder="至少 6 位"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  className={styles.eye}
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>

            {setup && (
              <label className={styles.field}>
                <span>确认密码</span>
                <div className={styles.inputWrap}>
                  <LockIcon />
                  <input
                    name="confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="再输入一次"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </div>
              </label>
            )}

            {!setup && (
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span className={styles.checkBox} aria-hidden="true" />
                <span className={styles.rememberText}>
                  记住登录状态
                  <small>
                    {remember
                      ? `${rememberDays} 天内免登录，下次打开直接进入`
                      : '只保持到关闭浏览器，公共电脑建议取消勾选'}
                  </small>
                </span>
              </label>
            )}

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? '处理中…' : setup ? '创建并进入' : '登录'}
            </button>
          </form>

          {state.defaultAccount && (
            <div className={styles.legacy}>
              <strong>升级提示</strong>
              <p>
                升级前的数据已归入账号 <b>{state.defaultAccount.username}</b>，初始密码{' '}
                <b>{state.defaultAccount.password}</b>。登录后请在右上角头像菜单里修改密码。
              </p>
            </div>
          )}

          <p className={styles.foot}>
            {setup ? '系统检测到还没有任何账号，先创建第一个管理员。' : '没有账号？请联系超级管理员在「管理 → 用户」中为你开通。'}
          </p>
        </section>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import api from '../api/axios';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [btnText, setBtnText] = useState(
    'Iniciar Sesión en el Lienzo'
  );
  const [btnIcon, setBtnIcon] = useState('arrow_forward');

  const handleLogin = async (event) => {
    event.preventDefault();

    setIsLoading(true);
    setBtnText('Autenticando JWT...');
    setBtnIcon('sync');

    try {
      const response = await api.post('/login/', {
        username,
        password
      });

      const storage = rememberSession
        ? localStorage
        : sessionStorage;

      storage.setItem('token', response.data.access);

      if (response.data.refresh) {
        storage.setItem('refreshToken', response.data.refresh);
      }

      setBtnText('¡Acceso concedido!');
      setBtnIcon('verified');

      setTimeout(() => {
        onLoginSuccess();
      }, 1000);
    } catch (error) {
      setIsLoading(false);
      setBtnText('Iniciar Sesión en el Lienzo');
      setBtnIcon('arrow_forward');

      alert(
        'No se pudo iniciar sesión. Verifica tus credenciales y que el backend esté funcionando.'
      );

      console.error('Error durante el inicio de sesión:', error);
    }
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-surface text-on-surface">
      {/* Encabezado */}
      <header className="border-b border-outline-variant/20 bg-surface-container-lowest/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center justify-between px-5 md:px-8 lg:px-12">
          {/* Logotipo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-container to-secondary-container shadow-lg shadow-primary-container/20">
              <span className="material-symbols-outlined text-[21px] text-white">
                account_tree
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-sm font-bold leading-none tracking-tight text-on-surface">
                DiagramCraft
              </span>

              <span className="mt-1 text-[9px] font-semibold uppercase leading-none tracking-[0.18em] text-primary">
                Studio
              </span>
            </div>
          </div>

          {/* Estado del backend */}
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full bg-surface-container px-4 py-2 sm:flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary" />

              <span className="font-mono text-[11px] font-semibold text-tertiary">
                Spring Boot 3.2 • Spring Security Online
              </span>
            </div>

            <button
              type="button"
              aria-label="Cambiar tema"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition hover:bg-surface-container-high hover:text-primary"
            >
              <span className="material-symbols-outlined text-[19px]">
                dark_mode
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-5 px-5 py-6 md:px-8 lg:grid-cols-12 lg:px-12">
          {/* Panel izquierdo */}
          <section className="relative overflow-hidden rounded-[28px] border border-outline-variant/20 bg-surface-container-low/90 p-6 shadow-2xl lg:col-span-5 xl:p-8">
            {/* Decoración */}
            <div className="pointer-events-none absolute -left-28 -top-28 h-72 w-72 rounded-full bg-primary-container/10 blur-3xl" />

            <div className="relative z-10">
              {/* Estado API */}
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-4 py-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary" />

                <span className="font-mono text-[10px] font-semibold text-tertiary">
                  Spring Boot REST API • Spring Security JWT • Conectado
                </span>
              </div>

              {/* Título */}
              <div className="mb-6 flex items-start gap-3">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-container/70 to-secondary-container">
                  <span className="material-symbols-outlined text-[21px] text-white">
                    account_tree
                  </span>
                </div>

                <div>
                  <h1 className="text-xl font-bold tracking-tight text-on-surface xl:text-2xl">
                    DiagramCraft Studio
                  </h1>

                  <p className="mt-2 max-w-xl text-sm leading-6 text-on-surface-variant">
                    Inicia sesión para acceder a tus lienzos, diagramas UML
                    y entidades JPA / Spring Data sincronizadas con tu
                    backend Java.
                  </p>
                </div>
              </div>

              {/* Formulario */}
              <form className="space-y-4" onSubmit={handleLogin}>
                {/* Usuario */}
                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block text-xs font-semibold text-on-surface-variant"
                  >
                    Credencial de Desarrollador
                  </label>

                  <div className="relative flex items-center rounded-lg border border-transparent bg-surface-container transition focus-within:border-primary/50 focus-within:bg-surface-container-high">
                    <span className="material-symbols-outlined absolute left-4 text-[19px] text-on-surface-variant">
                      alternate_email
                    </span>

                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      disabled={isLoading}
                      placeholder="Nombre de usuario o correo electrónico"
                      value={username}
                      onChange={(event) =>
                        setUsername(event.target.value)
                      }
                      className="w-full bg-transparent py-3.5 pl-12 pr-4 text-sm text-on-surface outline-none placeholder:text-outline disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Contraseña */}
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label
                      htmlFor="password"
                      className="text-xs font-semibold text-on-surface-variant"
                    >
                      Contraseña de Acceso
                    </label>

                    <button
                      type="button"
                      className="text-[10px] font-semibold text-primary transition hover:text-tertiary"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>

                  <div className="relative flex items-center rounded-lg border border-transparent bg-surface-container transition focus-within:border-primary/50 focus-within:bg-surface-container-high">
                    <span className="material-symbols-outlined absolute left-4 text-[19px] text-on-surface-variant">
                      key
                    </span>

                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      disabled={isLoading}
                      placeholder="Ingresa tu contraseña"
                      value={password}
                      onChange={(event) =>
                        setPassword(event.target.value)
                      }
                      className="w-full bg-transparent py-3.5 pl-12 pr-12 text-sm text-on-surface outline-none placeholder:text-outline disabled:cursor-not-allowed disabled:opacity-60"
                    />

                    <button
                      type="button"
                      aria-label={
                        showPassword
                          ? 'Ocultar contraseña'
                          : 'Mostrar contraseña'
                      }
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container-highest hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-[19px]">
                        {showPassword
                          ? 'visibility_off'
                          : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Mantener sesión */}
                <label className="flex cursor-pointer items-center gap-3 text-[11px] text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(event) =>
                      setRememberSession(event.target.checked)
                    }
                    className="h-4 w-4 cursor-pointer accent-[#8083ff]"
                  />

                  <span>
                    Mantener sesión activa{' '}
                    <span className="font-mono text-tertiary">
                      (JWT Refresh Token prolongado)
                    </span>
                  </span>
                </label>

                {/* Botón iniciar sesión */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-bold transition-all duration-200 ${
                    isLoading
                      ? 'cursor-not-allowed bg-surface-variant text-on-surface-variant'
                      : 'bg-gradient-to-r from-primary-container to-secondary-container text-white shadow-lg shadow-primary-container/20 hover:brightness-110 active:scale-[0.99]'
                  }`}
                >
                  <span>{btnText}</span>

                  <span
                    className={`material-symbols-outlined text-[19px] ${
                      isLoading ? 'animate-spin' : ''
                    }`}
                  >
                    {btnIcon}
                  </span>
                </button>
              </form>

              {/* Separador */}
              <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-outline-variant/40" />

                <span className="text-[9px] font-bold uppercase tracking-wider text-outline">
                  Acceso rápido de desarrollador
                </span>

                <div className="h-px flex-1 bg-outline-variant/40" />
              </div>

              {/* Accesos sociales */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container px-2 py-3 text-xs text-on-surface-variant transition hover:border-primary/50 hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="text-base font-bold">◉</span>
                  GitHub
                </button>

                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container px-2 py-3 text-xs text-on-surface-variant transition hover:border-primary/50 hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="font-bold text-[#4285F4]">G</span>
                  Google
                </button>

                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container px-2 py-3 text-xs text-on-surface-variant transition hover:border-primary/50 hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="text-orange-500">◆</span>
                  GitLab
                </button>
              </div>

              {/* Endpoint */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px]">
                <span className="text-tertiary">
                  POST /api/v1/auth/authenticate
                </span>

                <span className="text-outline">
                  Spring Boot + React Stack
                </span>
              </div>
            </div>
          </section>

          {/* Panel derecho */}
          <section className="relative hidden min-h-[590px] overflow-hidden rounded-[28px] border border-outline-variant/20 bg-surface-container-lowest shadow-2xl lg:col-span-7 lg:flex lg:flex-col">
            {/* Cuadrícula */}
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  'radial-gradient(circle, #908fa0 1px, transparent 1px)',
                backgroundSize: '24px 24px'
              }}
            />

            {/* Barra de herramientas */}
            <div className="relative z-10 m-5 flex items-center justify-between rounded-full border border-outline-variant/20 bg-surface-container-high/90 px-4 py-2.5 shadow-lg backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-on-primary-container"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    near_me
                  </span>
                </button>

                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  timeline
                </span>

                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  grid_view
                </span>

                <span className="ml-1 rounded-full bg-tertiary-container/30 px-3 py-1 font-mono text-[9px] font-bold text-tertiary">
                  JPA / Hibernate Entities
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="rounded-full bg-surface-container-highest px-3 py-1 font-mono text-[9px] text-on-surface-variant">
                  100%
                </span>

                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  download
                </span>
              </div>
            </div>

            {/* Diagrama UML */}
            <div className="relative z-10 flex flex-1 items-center justify-center px-6">
              <div className="flex w-full items-center justify-center gap-0">
                {/* Usuario */}
                <article className="w-[240px] shrink-0 overflow-hidden rounded-lg border border-primary-container/50 bg-surface-container shadow-2xl">
                  <div className="flex items-center justify-between bg-primary-container px-4 py-3 text-on-primary-container">
                    <span className="flex items-center gap-2 text-xs font-bold">
                      <span className="material-symbols-outlined text-[16px]">
                        description
                      </span>
                      Usuario.java
                    </span>

                    <span className="font-mono text-[8px]">
                      &lt;&lt;Entity&gt;&gt;
                    </span>
                  </div>

                  <div className="border-b border-outline-variant/50 px-4 py-3 font-mono text-[9px] leading-5 text-on-surface-variant">
                    <p>
                      <span className="text-tertiary">#</span> id:
                      <span className="float-right">UUID @Id</span>
                    </p>
                    <p>
                      <span className="text-primary">+</span> username:
                      <span className="float-right">
                        String @Column
                      </span>
                    </p>
                    <p>
                      <span className="text-primary">+</span> email:
                      <span className="float-right">
                        String @Column
                      </span>
                    </p>
                    <p>
                      <span className="text-primary">+</span> isEnabled:
                      <span className="float-right">Boolean</span>
                    </p>
                  </div>

                  <div className="px-4 py-3 font-mono text-[9px] leading-5 text-on-surface">
                    <p>+ getAuthorities()</p>
                    <p className="pl-3 text-tertiary">
                      Collection
                    </p>
                    <p>+ generateJwtToken(): String</p>
                  </div>
                </article>

                {/* Relación */}
                <div className="relative h-14 min-w-[62px] flex-1">
                  <div className="absolute left-0 right-0 top-1/2 border-t-2 border-dotted border-primary-container" />

                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-tertiary-container/50 bg-surface-container-high px-2 py-1 font-mono text-[8px] text-tertiary">
                    @OneToMany
                  </span>
                </div>

                {/* Proyecto */}
                <article className="w-[240px] shrink-0 overflow-hidden rounded-lg border border-secondary/50 bg-surface-container shadow-2xl">
                  <div className="flex items-center justify-between bg-secondary-container px-4 py-3 text-secondary-fixed">
                    <span className="flex items-center gap-2 text-xs font-bold">
                      <span className="material-symbols-outlined text-[16px]">
                        account_tree
                      </span>
                      Proyecto.java
                    </span>

                    <span className="font-mono text-[8px]">
                      &lt;&lt;Entity&gt;&gt;
                    </span>
                  </div>

                  <div className="border-b border-outline-variant/50 px-4 py-3 font-mono text-[9px] leading-5 text-on-surface-variant">
                    <p>
                      <span className="text-tertiary">#</span> id:
                      <span className="float-right">UUID @Id</span>
                    </p>
                    <p>
                      <span className="text-primary">+</span> usuario:
                      <span className="float-right">
                        @ManyToOne Usuario
                      </span>
                    </p>
                    <p>
                      <span className="text-primary">+</span> title:
                      <span className="float-right">
                        String @NotBlank
                      </span>
                    </p>
                    <p>
                      <span className="text-primary">+</span> schemaJson:
                      <span className="float-right">
                        String @Lob
                      </span>
                    </p>
                  </div>

                  <div className="px-4 py-3 font-mono text-[9px] leading-5 text-on-surface">
                    <p>+ toDto(): ProyectoDTO</p>
                    <p>+ exportEntities(): byte[]</p>
                  </div>
                </article>
              </div>
            </div>

            {/* Panel inferior */}
            <div className="relative z-10 m-5 flex items-center justify-between gap-4 rounded-lg border border-outline-variant/30 bg-surface-container-high/95 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tertiary-container/50 text-tertiary">
                  <span className="material-symbols-outlined text-[20px]">
                    auto_awesome
                  </span>
                </div>

                <div>
                  <p className="text-xs font-bold text-on-surface">
                    Generación Automática Spring Boot
                  </p>

                  <p className="mt-1 text-[9px] text-on-surface-variant">
                    Entidades JPA, Repositorios Spring Data y DTOs
                    generados con un clic.
                  </p>
                </div>
              </div>

              <div className="hidden shrink-0 grid-cols-2 gap-2 xl:grid">
                <span className="rounded bg-primary-container/20 px-2 py-1 text-[8px] font-bold text-primary">
                  Real-Time Sync
                </span>

                <span className="rounded bg-tertiary-container/20 px-2 py-1 text-[8px] font-bold text-tertiary">
                  Entity / DTO
                </span>

                <span className="rounded bg-primary-container/20 px-2 py-1 text-[8px] font-bold text-primary">
                  Spring Data JPA
                </span>

                <span className="rounded bg-tertiary-container/20 px-2 py-1 text-[8px] font-bold text-tertiary">
                  Spring Security
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Pie de página */}
      <footer className="border-t border-outline-variant/20">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col items-center justify-between gap-2 px-5 py-3 text-[9px] text-outline sm:flex-row md:px-8 lg:px-12">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[13px] text-tertiary">
              lock
            </span>
            256-Bit JWT Session • Spring Security Protected Architecture
          </span>

          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
            Cluster Latency: 24ms
          </span>

          <span>© 2026 DiagramCraft Studio</span>
        </div>
      </footer>
    </div>
  );
}
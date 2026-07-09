// Theme System for TillKit
// CSS variable-based theming with runtime switching

export interface ThemeColors {
  // Brand colors
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  accent: string;
  'accent-foreground': string;
  
  // Neutral colors
  background: string;
  foreground: string;
  muted: string;
  'muted-foreground': string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;
  border: string;
  input: string;
  ring: string;
  
  // Semantic colors
  destructive: string;
  'destructive-foreground': string;
  success: string;
  'success-foreground': string;
  warning: string;
  'warning-foreground': string;
  info: string;
  'info-foreground': string;
}

export interface ThemeTypography {
  'font-sans': string;
  'font-serif': string;
  'font-mono': string;
  'font-heading': string;
  
  'text-xs': string;
  'text-sm': string;
  'text-base': string;
  'text-lg': string;
  'text-xl': string;
  'text-2xl': string;
  'text-3xl': string;
  'text-4xl': string;
  'text-5xl': string;
}

export interface ThemeSpacing {
  'space-1': string;
  'space-2': string;
  'space-3': string;
  'space-4': string;
  'space-5': string;
  'space-6': string;
  'space-8': string;
  'space-10': string;
  'space-12': string;
  'space-16': string;
  'space-20': string;
  'space-24': string;
}

export interface ThemeRadii {
  none: string;
  sm: string;
  DEFAULT: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
  full: string;
}

export interface ThemeShadows {
  sm: string;
  DEFAULT: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  inner: string;
  none: string;
}

export interface Theme {
  name: string;
  description?: string;
  colors: ThemeColors;
  dark?: Partial<ThemeColors>;
  typography?: Partial<ThemeTypography>;
  spacing?: Partial<ThemeSpacing>;
  radii?: Partial<ThemeRadii>;
  shadows?: Partial<ThemeShadows>;
}

// Default typography scale
export const defaultTypography: ThemeTypography = {
  'font-sans': 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  'font-serif': 'Georgia, Cambria, "Times New Roman", Times, serif',
  'font-mono': 'Menlo, Monaco, "Consolas", "Liberation Mono", monospace',
  'font-heading': 'var(--font-sans)',
  
  'text-xs': '0.75rem',
  'text-sm': '0.875rem',
  'text-base': '1rem',
  'text-lg': '1.125rem',
  'text-xl': '1.25rem',
  'text-2xl': '1.5rem',
  'text-3xl': '1.875rem',
  'text-4xl': '2.25rem',
  'text-5xl': '3rem',
};

// Default spacing scale
export const defaultSpacing: ThemeSpacing = {
  'space-1': '0.25rem',
  'space-2': '0.5rem',
  'space-3': '0.75rem',
  'space-4': '1rem',
  'space-5': '1.25rem',
  'space-6': '1.5rem',
  'space-8': '2rem',
  'space-10': '2.5rem',
  'space-12': '3rem',
  'space-16': '4rem',
  'space-20': '5rem',
  'space-24': '6rem',
};

// Default border radii
export const defaultRadii: ThemeRadii = {
  none: '0',
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px',
};

// Default shadows
export const defaultShadows: ThemeShadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  none: 'none',
};

// Minimal theme (default)
export const minimalTheme: Theme = {
  name: 'minimal',
  description: 'Clean, minimal design with neutral colors',
  colors: {
    primary: '#18181b',
    'primary-foreground': '#fafafa',
    secondary: '#f4f4f5',
    'secondary-foreground': '#18181b',
    accent: '#f4f4f5',
    'accent-foreground': '#18181b',
    background: '#ffffff',
    foreground: '#18181b',
    muted: '#f4f4f5',
    'muted-foreground': '#71717a',
    card: '#ffffff',
    'card-foreground': '#18181b',
    popover: '#ffffff',
    'popover-foreground': '#18181b',
    border: '#e4e4e7',
    input: '#e4e4e7',
    ring: '#18181b',
    destructive: '#ef4444',
    'destructive-foreground': '#fafafa',
    success: '#22c55e',
    'success-foreground': '#fafafa',
    warning: '#f59e0b',
    'warning-foreground': '#18181b',
    info: '#3b82f6',
    'info-foreground': '#fafafa',
  },
  dark: {
    background: '#09090b',
    foreground: '#fafafa',
    muted: '#27272a',
    'muted-foreground': '#a1a1aa',
    card: '#18181b',
    'card-foreground': '#fafafa',
    popover: '#18181b',
    'popover-foreground': '#fafafa',
    border: '#27272a',
    input: '#27272a',
    ring: '#d4d4d8',
    secondary: '#27272a',
    'secondary-foreground': '#fafafa',
    accent: '#27272a',
    'accent-foreground': '#fafafa',
    primary: '#fafafa',
    'primary-foreground': '#18181b',
  },
};

// Modern theme (vibrant blues)
export const modernTheme: Theme = {
  name: 'modern',
  description: 'Vibrant design with blue accents',
  colors: {
    primary: '#2563eb',
    'primary-foreground': '#ffffff',
    secondary: '#f1f5f9',
    'secondary-foreground': '#0f172a',
    accent: '#3b82f6',
    'accent-foreground': '#ffffff',
    background: '#ffffff',
    foreground: '#0f172a',
    muted: '#f1f5f9',
    'muted-foreground': '#64748b',
    card: '#ffffff',
    'card-foreground': '#0f172a',
    popover: '#ffffff',
    'popover-foreground': '#0f172a',
    border: '#e2e8f0',
    input: '#e2e8f0',
    ring: '#2563eb',
    destructive: '#ef4444',
    'destructive-foreground': '#ffffff',
    success: '#10b981',
    'success-foreground': '#ffffff',
    warning: '#f59e0b',
    'warning-foreground': '#0f172a',
    info: '#06b6d4',
    'info-foreground': '#ffffff',
  },
  dark: {
    background: '#020617',
    foreground: '#f8fafc',
    muted: '#1e293b',
    'muted-foreground': '#94a3b8',
    card: '#0f172a',
    'card-foreground': '#f8fafc',
    popover: '#0f172a',
    'popover-foreground': '#f8fafc',
    border: '#1e293b',
    input: '#1e293b',
    ring: '#60a5fa',
    secondary: '#1e293b',
    'secondary-foreground': '#f8fafc',
    accent: '#1d4ed8',
    'accent-foreground': '#ffffff',
    primary: '#60a5fa',
    'primary-foreground': '#020617',
  },
};

// Boutique theme (warm, elegant)
export const boutiqueTheme: Theme = {
  name: 'boutique',
  description: 'Elegant design with warm tones',
  colors: {
    primary: '#7c2d12',
    'primary-foreground': '#fff7ed',
    secondary: '#fff7ed',
    'secondary-foreground': '#7c2d12',
    accent: '#c2410c',
    'accent-foreground': '#ffffff',
    background: '#fafaf9',
    foreground: '#292524',
    muted: '#f5f5f4',
    'muted-foreground': '#78716c',
    card: '#ffffff',
    'card-foreground': '#292524',
    popover: '#ffffff',
    'popover-foreground': '#292524',
    border: '#e7e5e4',
    input: '#e7e5e4',
    ring: '#7c2d12',
    destructive: '#dc2626',
    'destructive-foreground': '#fff7ed',
    success: '#16a34a',
    'success-foreground': '#fff7ed',
    warning: '#d97706',
    'warning-foreground': '#292524',
    info: '#0891b2',
    'info-foreground': '#fff7ed',
  },
  dark: {
    background: '#1c1917',
    foreground: '#fafaf9',
    muted: '#44403c',
    'muted-foreground': '#a8a29e',
    card: '#292524',
    'card-foreground': '#fafaf9',
    popover: '#292524',
    'popover-foreground': '#fafaf9',
    border: '#44403c',
    input: '#44403c',
    ring: '#c2410c',
    secondary: '#44403c',
    'secondary-foreground': '#fafaf9',
    accent: '#9a3412',
    'accent-foreground': '#ffffff',
    primary: '#c2410c',
    'primary-foreground': '#fff7ed',
  },
};

// Theme registry
export const themes: Record<string, Theme> = {
  minimal: minimalTheme,
  modern: modernTheme,
  boutique: boutiqueTheme,
};

// Generate CSS variables from theme
export function generateCSSVariables(theme: Theme, mode: 'light' | 'dark' = 'light'): string {
  const colors = mode === 'dark' && theme.dark 
    ? { ...theme.colors, ...theme.dark }
    : theme.colors;
  
  const typography = { ...defaultTypography, ...theme.typography };
  const spacing = { ...defaultSpacing, ...theme.spacing };
  const radii = { ...defaultRadii, ...theme.radii };
  const shadows = { ...defaultShadows, ...theme.shadows };
  
  const lines: string[] = [];
  
  // Colors (CSS variables)
  lines.push('  /* Colors */');
  for (const [key, value] of Object.entries(colors)) {
    lines.push(`  --${key}: ${value};`);
  }
  
  // Typography
  lines.push('\n  /* Typography */');
  for (const [key, value] of Object.entries(typography)) {
    lines.push(`  --${key}: ${value};`);
  }
  
  // Spacing
  lines.push('\n  /* Spacing */');
  for (const [key, value] of Object.entries(spacing)) {
    lines.push(`  --${key}: ${value};`);
  }
  
  // Radii
  lines.push('\n  /* Border Radius */');
  for (const [key, value] of Object.entries(radii)) {
    lines.push(`  --radius-${key}: ${value};`);
  }
  
  // Shadows
  lines.push('\n  /* Shadows */');
  for (const [key, value] of Object.entries(shadows)) {
    lines.push(`  --shadow-${key}: ${value};`);
  }
  
  return lines.join('\n');
}

// Generate full CSS for a theme
export function generateThemeCSS(theme: Theme): string {
  const lightVars = generateCSSVariables(theme, 'light');
  const darkVars = theme.dark ? generateCSSVariables(theme, 'dark') : null;
  
  let css = `:root {\n${lightVars}\n}`;
  
  if (darkVars) {
    css += `\n\n[data-theme="dark"] {\n${darkVars}\n}\n\n@media (prefers-color-scheme: dark) {\n  :root[data-theme="auto"] {\n${darkVars}\n  }\n}`;
  }
  
  return css;
}

// Inline theme CSS for emails/other uses
export function generateInlineThemeCSS(theme: Theme, mode: 'light' | 'dark' = 'light'): string {
  return generateCSSVariables(theme, mode).replace(/\n {2}/g, '; ').replace(/^ {2}/, '');
}

// Theme manager for runtime switching
export class ThemeManager {
  private currentTheme: string = 'minimal';
  private currentMode: 'light' | 'dark' | 'auto' = 'auto';
  private listeners: Set<(theme: string, mode: string) => void> = new Set();
  
  get theme(): string {
    return this.currentTheme;
  }
  
  get mode(): 'light' | 'dark' | 'auto' {
    return this.currentMode;
  }
  
  setTheme(name: string): void {
    if (themes[name]) {
      this.currentTheme = name;
      this.notify();
    }
  }
  
  setMode(mode: 'light' | 'dark' | 'auto'): void {
    this.currentMode = mode;
    this.notify();
  }
  
  toggleDarkMode(): void {
    if (this.currentMode === 'dark') {
      this.currentMode = 'light';
    } else if (this.currentMode === 'light') {
      this.currentMode = 'dark';
    } else {
      // Auto: check system preference
      this.currentMode = 'dark'; // Default to dark when toggling from auto
    }
    this.notify();
  }
  
  getCurrentTheme(): Theme {
    return themes[this.currentTheme] || minimalTheme;
  }
  
  getEffectiveMode(): 'light' | 'dark' {
    if (this.currentMode === 'auto') {
      // In browser, would check matchMedia
      return 'light'; // Default
    }
    return this.currentMode;
  }
  
  // Server-side: get data-theme attribute value
  getThemeAttribute(): string {
    if (this.currentMode === 'dark') return 'dark';
    if (this.currentMode === 'light') return 'light';
    return 'auto';
  }
  
  // Subscribe to theme changes
  onChange(callback: (theme: string, mode: string) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentTheme, this.getThemeAttribute());
    }
  }
}

// Global theme manager instance
export const themeManager = new ThemeManager();

// Helper to get theme CSS for HTML head
export function getThemeStyles(themeName: string = 'minimal'): string {
  const theme = themes[themeName] || minimalTheme;
  return generateThemeCSS(theme);
}

// Custom theme creation helper
export function createTheme(
  name: string,
  baseTheme: Theme,
  overrides: Partial<Theme>
): Theme {
  return {
    ...baseTheme,
    ...overrides,
    name,
    colors: { ...baseTheme.colors, ...overrides.colors },
    dark: overrides.dark ? { ...baseTheme.dark, ...overrides.dark } : baseTheme.dark,
  };
}

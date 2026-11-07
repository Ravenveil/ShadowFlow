import React from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { I18nProvider } from '../common/i18n'

function AllProviders({ children }: { children: React.ReactNode }) {
  return <I18nProvider defaultLanguage="zh">{children}</I18nProvider>
}

function renderWithProviders(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export * from '@testing-library/react'
export { renderWithProviders as render }

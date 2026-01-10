/*!
 * Color mode toggler adapted from Bootstrap
 */

(() => {
    'use strict'

    const getStoredTheme = (): string | null => localStorage.getItem('theme')
    const setStoredTheme = (theme: string): void => localStorage.setItem('theme', theme)

    const getPreferredTheme = (): string => {
        const storedTheme = getStoredTheme()
        if (storedTheme) {
            return storedTheme
        }

        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    const setTheme = (theme: string): void => {
        console.log('Setting theme to:', theme);
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-bs-theme', theme);
        }
    }

    setTheme(getPreferredTheme())

    const showActiveTheme = (theme: string): void => {
        const themeSwitcher = document.querySelector('#bd-theme')

        if (!themeSwitcher) {
            return
        }

        document.querySelectorAll('[data-bs-theme-value]').forEach(element => {
            element.classList.remove('active')
        })

        const btnToActive = document.querySelector(`[data-bs-theme-value="${theme}"]`) as HTMLElement
        if (btnToActive) {
            btnToActive.classList.add('active')
        }
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const storedTheme = getStoredTheme()
        if (storedTheme !== 'light' && storedTheme !== 'dark') {
            setTheme(getPreferredTheme())
        }
    })

    window.addEventListener('DOMContentLoaded', () => {
        showActiveTheme(getPreferredTheme())

        document.querySelectorAll('[data-bs-theme-value]')
        .forEach(toggle => {
            toggle.addEventListener('click', () => {
                const theme = toggle.getAttribute('data-bs-theme-value')
                if (theme) {
                    setStoredTheme(theme)
                    setTheme(theme)
                    showActiveTheme(theme)
                }
            })
        })
    })
})()

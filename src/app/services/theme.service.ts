import { Injectable, signal, effect } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  isDark = signal<boolean>(true);

  constructor() {
    // Cargar preferencia guardada
    const saved = localStorage.getItem('theme');
    if (saved) {
      this.isDark.set(saved === 'dark');
    }

    // Escuchar cambios y aplicar clase al body
    effect(() => {
      if (this.isDark()) {
        document.body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
      } else {
        document.body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
      }
    });
  }

  toggleTheme() {
    this.isDark.update(v => !v);
  }
}

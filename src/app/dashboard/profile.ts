import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class ProfileComponent {
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);

  user = toSignal(this.firebaseService.user$);
  profile = signal<any>({
    name: '',
    companyName: '',
    nit: '',
    logoUrl: ''
  });

  loading = signal(true);
  saving = signal(false);

  // Selector de fotos para el logo
  showPhotoSourceModal = signal(false);

  constructor() {
    effect(() => {
      const currentUser = this.user();
      if (currentUser) {
        this.firebaseService.getProfile(currentUser.uid).subscribe(data => {
          if (data) {
            this.profile.set({ ...this.profile(), ...data });
          } else {
            // Inicializar con nombre de auth si no hay perfil
            this.profile.update(p => ({ ...p, name: currentUser.displayName || '' }));
          }
          this.loading.set(false);
        });
      }
    });
  }

  // Compresión inteligente para soportar archivos grandes (>1MB)
  async compressImage(base64: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max = 800; // Para el logo no necesitamos tanta resolución

        if (width > height) {
          if (width > max) {
            height *= max / width;
            width = max;
          }
        } else {
          if (height > max) {
            width *= max / height;
            height = max;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = base64;
    });
  }

  async saveProfile() {
    const currentUser = this.user();
    if (currentUser) {
      this.saving.set(true);
      try {
        await this.firebaseService.updateProfile(currentUser.uid, this.profile());
        alert('Perfil actualizado con éxito');
      } catch (error) {
        console.error('Error al guardar perfil:', error);
        alert('Error al guardar los datos.');
      } finally {
        this.saving.set(false);
      }
    }
  }

  // Subida de logo mediante Base64 con compresión
  async onLogoUpload(event: any) {
    const file = event.target.files[0];
    const currentUser = this.user();
    
    if (!file || !currentUser) return;

    this.saving.set(true);
    this.showPhotoSourceModal.set(false);

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const compressedBase64 = await this.compressImage(e.target.result);
        this.profile.update(p => ({ ...p, logoUrl: compressedBase64 }));
        await this.firebaseService.updateProfile(currentUser.uid, this.profile());
        alert('¡Logo actualizado con éxito! ✨');
      } catch (error) {
        console.error('Error al procesar logo:', error);
        alert('Error al guardar el logo.');
      } finally {
        this.saving.set(false);
      }
    };
    reader.readAsDataURL(file);
  }
}

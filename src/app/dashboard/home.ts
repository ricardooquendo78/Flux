import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FirebaseService } from '../services/firebase.service';
import { ThemeService } from '../services/theme.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent {
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);
  public themeService = inject(ThemeService);

  // Estado del Modal
  showModal = signal(false);
  newProject = {
    name: '',
    description: '',
    status: 'iniciado' as const
  };

  // Obtener el usuario actual
  user = toSignal(this.firebaseService.user$);
  profile = signal<any>(null);
  
  // Proyectos reactivos desde Firestore
  projects = signal<any[]>([]);

  constructor() {
    // Cuando el usuario cambia, cargar sus proyectos y perfil
    effect(() => {
      const currentUser = this.user();
      if (currentUser) {
        // Cargar proyectos
        this.firebaseService.getProjects(currentUser.uid).subscribe(data => {
          this.projects.set(data);
        });
        // Cargar perfil
        this.firebaseService.getProfile(currentUser.uid).subscribe(data => {
          this.profile.set(data);
        });
      }
    });
  }

  openModal() {
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.newProject = { name: '', description: '', status: 'iniciado' };
  }

  async saveProject() {
    if (!this.newProject.name) return;

    const currentUser = this.user();
    if (currentUser) {
      const projectToSave = { ...this.newProject };
      this.closeModal(); 
      
      try {
        console.log('Intentando guardar proyecto para el usuario:', currentUser.uid);
        await this.firebaseService.addProject(currentUser.uid, {
          ...projectToSave,
          createdAt: new Date()
        });
        console.log('¡Proyecto guardado exitosamente!');
      } catch (error: any) {
        console.error('ERROR CRÍTICO AL GUARDAR:', error);
        alert('Error de Firebase al guardar: ' + (error.message || error));
      }
    } else {
      alert('Error: No se ha detectado un usuario autenticado.');
    }
  }

  async deleteProject(projectId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar este proyecto?')) return;

    const currentUser = this.user();
    if (currentUser) {
      try {
        await this.firebaseService.deleteProject(currentUser.uid, projectId);
      } catch (error) {
        console.error('Error al eliminar proyecto:', error);
      }
    }
  }

  async logout() {
    if (!confirm('¿Estás seguro de que quieres cerrar sesión en Flux?')) return;
    await this.firebaseService.logout();
    this.router.navigate(['/login']);
  }

  getFirstName(fullName: string | null | undefined): string {
    if (!fullName) return 'Usuario';
    return fullName.trim().split(' ')[0];
  }

  getStatusClass(status: string) {
    if (!status) return {};
    const slug = status.toLowerCase().replace(/\s+/g, '-');
    return { [`status-${slug}`]: true };
  }
}

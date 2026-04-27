import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';
import { ThemeService } from '../services/theme.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { take, Subscription } from 'rxjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css'
})
export class ProjectDetailComponent {
  private route = inject(ActivatedRoute);
  private firebaseService = inject(FirebaseService);
  private router = inject(Router);
  public themeService = inject(ThemeService);

  user = toSignal(this.firebaseService.user$);
  project = signal<any>(null);
  divisions = signal<any[]>([]);
  profile = signal<any>(null);
  loading = signal(true);

  // Navegación interna
  activeTab = signal<'structure' | 'summary'>('structure');

  // Estado de configuración
  showSetup = signal(false);
  divisionType = signal('Zonas');
  newDivisionName = signal('');
  selectedDivision = signal<any>(null);
  tasks = signal<any[]>([]);

  // Para tareas comunes
  showCommonTaskModal = signal(false);
  commonTaskName = signal('');
  commonActivities = signal<string[]>([]);
  newCommonActivity = signal('');

  allTasks = signal<any[]>([]);

  // Para el selector de fotos
  showPhotoSourceModal = signal(false);
  pendingPhotoData = signal<{ divId: string, type: 'before' | 'after' } | null>(null);

  // Para el modal de observaciones centralizado
  showObservationModal = signal(false);
  selectedTaskForObs = signal<any>(null);
  observationText = signal('');

  // Para añadir tareas individuales a una zona
  showAddTaskModal = signal(false);
  addTaskDivisionId = signal<string | null>(null);
  newTaskName = signal('');
  newTaskActivities = signal(''); // Se ingresarán separadas por comas

  constructor() {
    effect(() => {
      const currentUser = this.user();
      const projectId = this.route.snapshot.paramMap.get('id');
      const tab = this.activeTab();
      
      if (currentUser && projectId) {
        // 1. Cargar Proyecto, Divisiones y Perfil
        this.firebaseService.getProject(currentUser.uid, projectId).subscribe(data => {
          this.project.set(data);
          this.loading.set(false);
          if (data && !data.divisionType) this.showSetup.set(true);
        });

        this.firebaseService.getProfile(currentUser.uid).subscribe(prof => {
          this.profile.set(prof);
        });

        this.firebaseService.getDivisions(currentUser.uid, projectId).subscribe(divs => {
          this.divisions.set(divs);
          
          // 2. Cargar TODAS las tareas para el resumen
          if (tab === 'summary') {
            this.allTasks.set([]);
            divs.forEach(div => {
              this.firebaseService.getTasks(currentUser.uid, projectId, div.id).pipe(take(1)).subscribe(taskData => {
                const tasksWithDiv = taskData.map(t => ({ ...t, divisionName: div.name, divisionId: div.id }));
                this.allTasks.update(current => [...current, ...tasksWithDiv]);
              });
            });
          }
        });

        // 3. Si estamos en Zonas y hay una seleccionada, cargamos sus tareas individuales (reactivas)
        const division = this.selectedDivision();
        if (tab === 'structure' && division) {
          this.firebaseService.getTasks(currentUser.uid, projectId, division.id).subscribe(data => {
            this.tasks.set(data);
          });
        }
      }
    });
  }

  getPendingTasksByDivision() {
    const divs = this.divisions();
    const all = this.allTasks();
    
    return divs.map(div => {
      const pendingInDiv = all.filter(t => t.divisionId === div.id && t.items && t.items.some((i: any) => !i.completed));
      return {
        ...div,
        pendingTasks: pendingInDiv
      };
    }).filter(div => div.pendingTasks.length > 0);
  }

  goToDivision(divId: string) {
    const div = this.divisions().find(d => d.id === divId);
    if (div) {
      console.log('Navegando a división:', div.name);
      this.activeTab.set('structure');
      this.selectedDivision.set(div);
    }
  }

  async updateObservation(task: any, obs: string) {
    const currentUser = this.user();
    const projectId = this.project()?.id;
    if (currentUser && projectId) {
      await this.firebaseService.updateTask(currentUser.uid, projectId, task.divisionId, task.id, { observation: obs });
    }
  }

  async addCommonTask() {
    if (!this.commonTaskName()) return;
    
    const currentUser = this.user();
    const projectId = this.project()?.id;
    const divs = this.divisions();
    const items = this.commonActivities().map(name => ({ name, completed: false }));

    if (currentUser && projectId && divs.length > 0) {
      for (const div of divs) {
        await this.firebaseService.addTask(currentUser.uid, projectId, div.id, {
          name: this.commonTaskName(),
          isCommon: true,
          items: items
        });
        // Actualizamos el progreso de cada división
        await this.updateDivisionProgress(div.id);
      }
      this.resetCommonTaskForm();
      this.showCommonTaskModal.set(false);
    }
  }

  addActivityToCommon() {
    if (!this.newCommonActivity()) return;
    this.commonActivities.update(list => [...list, this.newCommonActivity()]);
    this.newCommonActivity.set('');
  }

  removeActivityFromCommon(index: number) {
    this.commonActivities.update(list => list.filter((_, i) => i !== index));
  }

  resetCommonTaskForm() {
    this.commonTaskName.set('');
    this.commonActivities.set([]);
    this.newCommonActivity.set('');
  }

  selectDivision(div: any) {
    this.selectedDivision.set(div);
  }

  async updateDivisionProgress(divId: string) {
    const currentUser = this.user();
    const projectId = this.project()?.id;
    if (currentUser && projectId && divId) {
      this.firebaseService.getTasks(currentUser.uid, projectId, divId).pipe(take(1)).subscribe(async tasks => {
        if (tasks.length === 0) return;
        const total = tasks.reduce((acc, t) => acc + this.getTaskProgress(t), 0);
        const progress = Math.round(total / tasks.length);
        
        await this.firebaseService.updateDivision(currentUser.uid, projectId, divId, { progress });
        
        // Después de actualizar la división, actualizamos el estado global del proyecto
        this.refreshProjectStatus();
      });
    }
  }

  async refreshProjectStatus() {
    const currentUser = this.user();
    const projectId = this.project()?.id;
    const divs = this.divisions();

    if (currentUser && projectId && divs.length > 0) {
      const totalProgress = this.calculateTotalProgress();
      let status: 'iniciado' | 'en proceso' | 'terminado' = 'iniciado';

      if (totalProgress === 100) {
        status = 'terminado';
      } else if (totalProgress > 2) {
        status = 'en proceso';
      } else {
        status = 'iniciado';
      }

      // Solo actualizamos si el estado ha cambiado para ahorrar escrituras
      if (this.project().status !== status) {
        await this.firebaseService.updateProject(currentUser.uid, projectId, { status });
      }
    }
  }

  async addTaskItem(task: any, itemName: string) {
    if (!itemName) return;
    const currentUser = this.user();
    const projectId = this.project()?.id;
    const divId = this.selectedDivision()?.id;

    if (currentUser && projectId && divId) {
      const items = [...(task.items || []), { name: itemName, completed: false }];
      await this.firebaseService.updateTask(currentUser.uid, projectId, divId, task.id, { items });
      await this.updateDivisionProgress(divId);
    }
  }

  async toggleItem(task: any, index: number) {
    const currentUser = this.user();
    const projectId = this.project()?.id;
    const divId = this.selectedDivision()?.id;

    if (currentUser && projectId && divId) {
      const items = [...task.items];
      items[index] = { ...items[index], completed: !items[index].completed };
      const allCompleted = items.every(i => i.completed);
      
      await this.firebaseService.updateTask(currentUser.uid, projectId, divId, task.id, { 
        items,
        completed: allCompleted
      });
      await this.updateDivisionProgress(divId);
    }
  }

  async removeTaskItem(task: any, index: number, event: Event) {
    event.stopPropagation(); // Evitar que el clic marque el check
    if (!confirm('¿Estás seguro de que quieres eliminar esta actividad?')) return;

    const currentUser = this.user();
    const projectId = this.project()?.id;
    const divId = this.selectedDivision()?.id;

    if (currentUser && projectId && divId) {
      const items = task.items.filter((_: any, i: number) => i !== index);
      const allCompleted = items.length > 0 && items.every((i: any) => i.completed);
      
      await this.firebaseService.updateTask(currentUser.uid, projectId, divId, task.id, { 
        items,
        completed: allCompleted
      });
      await this.updateDivisionProgress(divId);
    }
  }

  async removeTask(taskId: string) {
    if (!confirm('¿Borrar esta tarea?')) return;
    const currentUser = this.user();
    const projectId = this.project()?.id;
    const divId = this.selectedDivision()?.id;
    if (currentUser && projectId && divId) {
      await this.firebaseService.deleteTask(currentUser.uid, projectId, divId, taskId);
    }
  }

  getTaskProgress(task: any): number {
    if (!task.items || task.items.length === 0) return task.completed ? 100 : 0;
    const completed = task.items.filter((i: any) => i.completed).length;
    return Math.round((completed / task.items.length) * 100);
  }

  getDivisionProgress(divId: string): number {
    // Para simplificar, calculamos basándonos en las tareas cargadas si es la seleccionada
    // O mejor, una lógica que funcione para todas las tarjetas
    const divTasks = this.tasks().filter(t => t.divisionId === divId);
    if (divTasks.length === 0) return 0;
    
    const totalProgress = divTasks.reduce((acc, task) => acc + this.getTaskProgress(task), 0);
    return Math.round(totalProgress / divTasks.length);
  }

  // Como las tareas solo se cargan para la división seleccionada, 
  // necesitamos una forma de calcular el progreso global.
  // Por ahora, calcularemos el de la zona seleccionada y el general.
  
  calculateTotalProgress(): number {
    const divs = this.divisions();
    if (divs.length === 0) return 0;
    
    const total = divs.reduce((acc, div) => acc + (div.progress || 0), 0);
    return Math.round(total / divs.length);
  }

  async saveStructure() {
    const currentUser = this.user();
    const projectId = this.project()?.id;
    if (currentUser && projectId) {
      await this.firebaseService.updateProject(currentUser.uid, projectId, {
        divisionType: this.divisionType()
      });
      this.showSetup.set(false);
    }
  }

  async addDivision() {
    if (!this.newDivisionName()) return;
    
    const currentUser = this.user();
    const projectId = this.project()?.id;
    if (currentUser && projectId) {
      await this.firebaseService.addDivision(currentUser.uid, projectId, {
        name: this.newDivisionName()
      });
      this.newDivisionName.set('');
    }
  }

  async removeDivision(divisionId: string, event: Event) {
    event.stopPropagation();
    if (!confirm(`¿Estás seguro de que quieres eliminar esta ${this.project().divisionType}? Se perderán todas sus tareas.`)) return;

    const currentUser = this.user();
    const projectId = this.project()?.id;
    if (currentUser && projectId) {
      await this.firebaseService.deleteDivision(currentUser.uid, projectId, divisionId);
      this.refreshProjectStatus();
    }
  }

  async saveCentralizedObservation() {
    const task = this.selectedTaskForObs();
    const text = this.observationText();
    const currentUser = this.user();
    const projectId = this.project()?.id;

    if (task && currentUser && projectId) {
      await this.firebaseService.updateTask(currentUser.uid, projectId, task.divisionId, task.id, { observation: text });
      this.showObservationModal.set(false);
      this.observationText.set('');
      this.selectedTaskForObs.set(null);
    }
  }

  openObsFromTask(task: any) {
    this.selectedTaskForObs.set(task);
    this.observationText.set(task.observation || '');
    this.showObservationModal.set(true);
  }

  openAddTaskModal(divId: string, event: Event) {
    event.stopPropagation();
    this.addTaskDivisionId.set(divId);
    this.newTaskName.set('');
    this.newTaskActivities.set('');
    this.showAddTaskModal.set(true);
  }

  async saveIndividualTask() {
    const currentUser = this.user();
    const projectId = this.project()?.id;
    const divId = this.addTaskDivisionId();
    const name = this.newTaskName();
    const activitiesStr = this.newTaskActivities();

    if (currentUser && projectId && divId && name) {
      try {
        // Procesar actividades
        const items = activitiesStr
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0)
          .map(a => ({ name: a, completed: false }));

        await this.firebaseService.addTask(currentUser.uid, projectId, divId, {
          name,
          items,
          completed: false
        });

        this.showAddTaskModal.set(false);
        this.refreshProjectStatus();
        
        // Si estamos viendo esta misma división, forzamos un pequeño refresh local
        if (this.selectedDivision()?.id === divId) {
          this.firebaseService.getTasks(currentUser.uid, projectId, divId).pipe(take(1)).subscribe(data => {
            this.tasks.set(data);
          });
        }
      } catch (error) {
        console.error('Error al crear tarea:', error);
        alert('Hubo un error al guardar la tarea. Por favor reintenta.');
      }
    }
  }

  openPhotoSource(divId: string, type: 'before' | 'after', event: Event) {
    event.stopPropagation();
    this.pendingPhotoData.set({ divId, type });
    this.showPhotoSourceModal.set(true);
  }

  async handlePhotoUpload(event: any) {
    const file = event.target.files[0];
    const data = this.pendingPhotoData();
    const currentUser = this.user();
    const projectId = this.project()?.id;

    if (!file || !data || !currentUser || !projectId) return;

    // Ya no bloqueamos archivos de 7MB, los comprimimos
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      const base64 = await this.compressImage(e.target.result);
      const updateData: any = {};
      if (data.type === 'before') updateData.beforeImage = base64;
      else updateData.afterImage = base64;

      try {
        await this.firebaseService.updateDivision(currentUser.uid, projectId, data.divId, updateData);
        this.showPhotoSourceModal.set(false);
      } catch (error) {
        console.error('Error al guardar foto de zona:', error);
        alert('Error al guardar la imagen');
      }
    };
    reader.readAsDataURL(file);
  }

  // Helper para comprimir imágenes y que quepan en Firestore
  compressImage(base64: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Redimensionar si es muy grande (máximo 1200px)
        const MAX_WIDTH = 1200;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Comprimir calidad al 70% para asegurar que pese < 1MB
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  }

  // ================= EXPORTACIÓN =================
  
  async exportPDF() {
    const doc = new jsPDF();
    const project = this.project();
    const profile = this.profile();
    const divisions = this.divisions();
    const allTasks = this.allTasks();

    if (!project) return;

    // 1. Encabezado
    if (profile?.logoUrl) {
      try {
        doc.addImage(profile.logoUrl, 'JPEG', 15, 10, 30, 30);
      } catch (e) { console.error('Error al añadir logo al PDF:', e); }
    }

    doc.setFontSize(18);
    doc.setTextColor(99, 102, 241);
    const projectName = this.project()?.name || 'Proyecto';
    const companyName = profile?.companyName || 'Empresa';
    const reportHeader = `${projectName} - ${companyName}`;
    doc.text(reportHeader, 50, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    const nitValue = profile?.nit || 'NIT no configurado';
    doc.text(`NIT: ${nitValue}`, 50, 26);
    doc.text(`Fecha de Reporte: ${new Date().toLocaleDateString()}`, 50, 32);

    doc.line(15, 45, 195, 45);

    // 2. Información del Proyecto
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(project.name, 15, 55);
    
    doc.setFontSize(11);
    doc.setTextColor(80);
    const splitDesc = doc.splitTextToSize(project.description || 'Sin descripción', 170);
    doc.text(splitDesc, 15, 62);
    
    const descHeight = splitDesc.length * 5;
    doc.setFontSize(12);
    doc.setTextColor(99, 102, 241);
    doc.text(`Progreso Total: ${this.calculateTotalProgress()}%`, 15, 65 + descHeight);

    let currentY = 75 + descHeight;

    // 3. Iterar por Divisiones
    for (const div of divisions) {
      // Verificar si hay espacio para una nueva zona, si no, nueva página
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text(div.name, 15, currentY); // Solo el nombre de la zona
      currentY += 8;

      // 3.1 Fotos Antes y Después (Side by Side)
      if (div.beforeImage || div.afterImage) {
        try {
          if (div.beforeImage) {
            doc.addImage(div.beforeImage, 'JPEG', 15, currentY, 85, 55);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text('Antes', 50, currentY + 62, { align: 'center' });
          }
          if (div.afterImage) {
            doc.addImage(div.afterImage, 'JPEG', 110, currentY, 85, 55);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text('Después', 150, currentY + 62, { align: 'center' });
          }
          currentY += 70;
        } catch (e) {
          console.error('Error al añadir fotos de zona:', e);
          currentY += 10;
        }
      }

      // 3.2 Tabla de Tareas de esta zona
      const divTasks = allTasks.filter(t => t.divisionId === div.id);
      const tableData = divTasks.flatMap(task => 
        (task.items || []).map((item: any) => [
          task.name,
          item.name,
          item.completed ? '✅ Terminado' : '⏳ Pendiente',
          task.observation || ''
        ])
      );

      autoTable(doc, {
        startY: currentY,
        head: [['Tarea', 'Actividad', 'Estado', 'Observación']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241] },
        margin: { left: 15 },
        didDrawPage: (data) => {
          currentY = data.cursor?.y || currentY;
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
    }

    doc.save(`Reporte_Flux_${project.name}.pdf`);
  }

  exportExcel() {
    const project = this.project();
    const divisions = this.divisions();
    const allTasks = this.allTasks();

    const data = allTasks.flatMap(task => {
      const div = divisions.find(d => d.id === task.divisionId);
      return (task.items || []).map((item: any) => ({
        [project.divisionType]: div?.name || '',
        'Tarea': task.name,
        'Actividad': item.name,
        'Estado': item.completed ? 'Terminado' : 'Pendiente',
        'Observación': task.observation || ''
      }));
    });

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `Reporte_Flux_${project?.name}.xlsx`);
  }
}

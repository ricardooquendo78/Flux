import { inject, Injectable } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, user, GoogleAuthProvider, signInWithPopup, authState } from '@angular/fire/auth';
import { Firestore, collection, addDoc, collectionData, doc, setDoc, docData, deleteDoc, updateDoc, query, orderBy, where } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Observable, from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  
  user$ = authState(this.auth);

  // Truco para aceptar 4 dígitos en Firebase (que pide 6 mínimo)
  private processPassword(pass: string) {
    return pass.length === 4 ? `${pass}00` : pass;
  }

  async register(userData: any) {
    const { email, password, name, phone } = userData;
    const securePass = this.processPassword(password);
    
    // 1. Crear usuario en Auth
    const credential = await createUserWithEmailAndPassword(this.auth, email, securePass);
    
    // 2. Guardar datos extra en Firestore
    await setDoc(doc(this.firestore, `users/${credential.user.uid}`), {
      name,
      email,
      phone,
      createdAt: new Date()
    });

    return credential;
  }

  async login(email: string, pass: string) {
    const securePass = this.processPassword(pass);
    return signInWithEmailAndPassword(this.auth, email, securePass);
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(this.auth, provider);
      if (result) {
        await setDoc(doc(this.firestore, `users/${result.user.uid}`), {
          name: result.user.displayName,
          email: result.user.email,
          photoURL: result.user.photoURL,
          lastLogin: new Date()
        }, { merge: true });
      }
      return result;
    } catch (error) {
      console.error('Error en login con Google:', error);
      throw error;
    }
  }

  logout() {
    return signOut(this.auth);
  }

  // Perfil de Usuario
  getUserProfile(userId: string): Observable<any> {
    const userRef = doc(this.firestore, `users/${userId}`);
    return docData(userRef);
  }

  // Proyectos
  getProfile(userId: string): Observable<any> {
    const profileRef = doc(this.firestore, `users/${userId}/profile/data`);
    return docData(profileRef) as Observable<any>;
  }

  async updateProfile(userId: string, data: any) {
    const profileRef = doc(this.firestore, `users/${userId}/profile/data`);
    return setDoc(profileRef, data, { merge: true });
  }

  getProjects(userId: string): Observable<any[]> {
    const projectsRef = collection(this.firestore, `users/${userId}/projects`);
    return collectionData(projectsRef, { idField: 'id' }) as Observable<any[]>;
  }

  getProject(userId: string, projectId: string): Observable<any> {
    const projectRef = doc(this.firestore, `users/${userId}/projects/${projectId}`);
    return docData(projectRef, { idField: 'id' });
  }

  async updateProject(userId: string, projectId: string, data: any) {
    const projectRef = doc(this.firestore, `users/${userId}/projects/${projectId}`);
    return setDoc(projectRef, data, { merge: true });
  }

  async updateDivision(userId: string, projectId: string, divisionId: string, data: any) {
    const divRef = doc(this.firestore, `users/${userId}/projects/${projectId}/divisions/${divisionId}`);
    return setDoc(divRef, data, { merge: true });
  }

  getDivisions(userId: string, projectId: string): Observable<any[]> {
    const divisionsRef = collection(this.firestore, `users/${userId}/projects/${projectId}/divisions`);
    return collectionData(divisionsRef, { idField: 'id' }) as Observable<any[]>;
  }

  async addDivision(userId: string, projectId: string, division: any) {
    const divisionsRef = collection(this.firestore, `users/${userId}/projects/${projectId}/divisions`);
    return addDoc(divisionsRef, {
      ...division,
      createdAt: new Date()
    });
  }

  getTasks(userId: string, projectId: string, divisionId: string): Observable<any[]> {
    const tasksRef = collection(this.firestore, `users/${userId}/projects/${projectId}/divisions/${divisionId}/tasks`);
    return collectionData(tasksRef, { idField: 'id' }) as Observable<any[]>;
  }

  async addTask(userId: string, projectId: string, divisionId: string, task: any) {
    const tasksRef = collection(this.firestore, `users/${userId}/projects/${projectId}/divisions/${divisionId}/tasks`);
    return addDoc(tasksRef, {
      ...task,
      items: task.items || [],
      completed: false,
      createdAt: new Date()
    });
  }

  async updateTask(userId: string, projectId: string, divisionId: string, taskId: string, data: any) {
    const taskRef = doc(this.firestore, `users/${userId}/projects/${projectId}/divisions/${divisionId}/tasks/${taskId}`);
    return setDoc(taskRef, data, { merge: true });
  }

  async deleteTask(userId: string, projectId: string, divisionId: string, taskId: string) {
    const taskRef = doc(this.firestore, `users/${userId}/projects/${projectId}/divisions/${divisionId}/tasks/${taskId}`);
    return deleteDoc(taskRef);
  }

  async addProject(userId: string, project: any) {
    const projectsRef = collection(this.firestore, `users/${userId}/projects`);
    return addDoc(projectsRef, {
      ...project,
      createdAt: new Date()
    });
  }

  async deleteProject(userId: string, projectId: string) {
    const projectRef = doc(this.firestore, `users/${userId}/projects/${projectId}`);
    return deleteDoc(projectRef);
  }

  async uploadImage(userId: string, folder: string, file: File): Promise<string> {
    const filePath = `users/${userId}/${folder}/${Date.now()}_${file.name}`;
    const fileRef = ref(this.storage, filePath);
    await uploadBytes(fileRef, file);
    return getDownloadURL(fileRef);
  }
}

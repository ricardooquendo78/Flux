import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '../services/firebase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  private router = inject(Router);
  private firebaseService = inject(FirebaseService);

  credentials = {
    email: '',
    password: ''
  };

  async onLogin() {
    try {
      console.log('Logging in with Firebase...');
      await this.firebaseService.login(this.credentials.email, this.credentials.password);
      console.log('Login successful!');
      this.router.navigate(['/home']);
    } catch (error: any) {
      console.error('Error in login:', error);
      alert('Error al entrar: Credenciales incorrectas o problema de conexión.');
    }
  }

  async loginWithGoogle() {
    try {
      await this.firebaseService.loginWithGoogle();
      this.router.navigate(['/home']);
    } catch (error) {
      console.error('Error with Google login:', error);
    }
  }
}

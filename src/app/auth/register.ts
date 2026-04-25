import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseService } from '../services/firebase.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class RegisterComponent {
  private router = inject(Router);
  private firebaseService = inject(FirebaseService);

  user = {
    name: '',
    email: '',
    phone: '',
    password: ''
  };

  async onRegister() {
    try {
      console.log('Registering user with Firebase...');
      await this.firebaseService.register(this.user);
      console.log('Registration successful!');
      this.router.navigate(['/home']);
    } catch (error: any) {
      console.error('Error in registration:', error);
      alert('Error al registrar: ' + error.message);
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

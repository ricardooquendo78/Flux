import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login';
import { RegisterComponent } from './auth/register';
import { HomeComponent } from './dashboard/home';
import { ProjectDetailComponent } from './dashboard/project-detail';
import { ProfileComponent } from './dashboard/profile';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'home', component: HomeComponent, canActivate: [authGuard] },
  { path: 'project/:id', component: ProjectDetailComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];

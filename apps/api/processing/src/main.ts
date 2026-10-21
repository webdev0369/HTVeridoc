import 'reflect-metadata';
import { createMicroserviceApp } from '@htveridoc/shared';
import { AppModule } from './app.module';

createMicroserviceApp({ appName: 'processing', AppModule: AppModule.forRoot() });

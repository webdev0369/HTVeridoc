import 'reflect-metadata';
import { createMicroserviceApp } from '@htveridoc/shared';
import { AppModule } from './app.module';

createMicroserviceApp({ appName: 'documents', AppModule });

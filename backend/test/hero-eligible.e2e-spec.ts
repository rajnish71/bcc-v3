import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AccessTokenGuard } from './../src/modules/identity/auth/access-token.guard';
import { RbacGuard } from './../src/modules/identity/rbac/rbac.guard';

describe('GalleryController - hero/eligible (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({ canActivate: (context: any) => {
        // Mock a user payload on the request
        const req = context.switchToHttp().getRequest();
        req.user = { sub: 1, username: 'admin', status: 'ACTIVE' };
        return true;
      }})
      .overrideGuard(RbacGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('should fetch eligible hero photos or return detailed error', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/gallery/hero/eligible');
    
    console.log('STATUS CODE:', res.status);
    console.log('RESPONSE BODY:', JSON.stringify(res.body, null, 2));
    
    expect(res.status).toBe(200);
  });

  afterEach(async () => {
    await app.close();
  });
});

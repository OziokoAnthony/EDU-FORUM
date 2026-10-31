import { Controller, Get } from '@nestjs/common';
import { APP_NAME } from '@edu-forum/shared';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', app: APP_NAME, time: new Date().toISOString() };
  }
}

import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('create-demo')
  createDemo() {
    return this.usersService.createDemoUser();
  }
}

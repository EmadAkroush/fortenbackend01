import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvestmentsService } from './investments.service';
import { InvestmentsController } from './investments.controller';
import { Investment, InvestmentSchema } from './schemas/investments.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Package, PackageSchema } from '../packages/schemas/packages.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Investment.name, schema: InvestmentSchema },
      { name: User.name, schema: UserSchema },
      { name: Package.name, schema: PackageSchema },
    ]),
  ],
  controllers: [InvestmentsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}

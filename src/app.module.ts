import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { PackagesModule } from './packages/packages.module';
import { InvestmentsModule } from './investments/investments.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ReferralsModule } from './referrals/referrals.module';
import { BonusesModule } from './bonuses/bonuses.module';
import { ActivityModule } from './activity/activity.module';


@Module({
  imports: [AuthModule, UsersModule , MongooseModule.forRoot('mongodb://localhost:27017/forten'), PackagesModule, InvestmentsModule, TransactionsModule, ReferralsModule, BonusesModule, ActivityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

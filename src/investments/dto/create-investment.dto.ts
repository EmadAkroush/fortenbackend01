import { IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateInvestmentDto {
  @IsMongoId()
  user: string;

  @IsMongoId()
  package: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsNumber()
  dailyRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

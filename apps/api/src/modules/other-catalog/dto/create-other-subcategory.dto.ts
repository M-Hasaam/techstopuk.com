import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOtherSubcategoryDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsOptional()
    icon?: string;
}

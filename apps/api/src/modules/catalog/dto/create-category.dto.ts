import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
    @IsString()
    name!: string;

    @IsString()
    slug!: string;

    @IsString()
    @IsOptional()
    displayName?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    icon?: string;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @IsBoolean()
    @IsOptional()
    isSellable?: boolean;

    @IsBoolean()
    @IsOptional()
    isRepairable?: boolean;
}

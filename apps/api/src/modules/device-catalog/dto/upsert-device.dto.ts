import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AttributeOptionDto {
    @IsString()
    label!: string;

    @IsArray()
    @IsString({ each: true })
    options!: string[];
}

export class UpsertDeviceDto {
    @IsString()
    brandCategoryId!: string;

    @IsString()
    model!: string;

    @IsArray()
    @IsString({ each: true })
    storageOptions!: string[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AttributeOptionDto)
    @IsOptional()
    attributeOptions?: AttributeOptionDto[];

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @IsBoolean()
    @IsOptional()
    tradeInEnabled?: boolean;

    @IsNumber()
    @IsOptional()
    manualMarketPrice?: number | null;
}

import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionOptionDto {
    @IsOptional()
    @IsString()
    id?: string; // present for an existing option being updated, absent for a new one

    @IsString()
    label!: string;

    @IsInt()
    order!: number;

    @IsOptional()
    @IsString()
    image?: string | null;

    @IsOptional()
    @IsString()
    icon?: string | null;

    @IsOptional()
    @IsIn(['success', 'warning', 'danger', 'info', 'neutral'])
    tone?: string | null;
}

export class UpsertQuestionDto {
    @IsString()
    category!: string;

    @IsOptional()
    @IsString()
    key?: string; // auto-derived from `question` on create if omitted

    @IsString()
    question!: string;

    @IsOptional()
    @IsInt()
    order?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => QuestionOptionDto)
    options!: QuestionOptionDto[];
}

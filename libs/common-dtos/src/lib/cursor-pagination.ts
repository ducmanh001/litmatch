import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query chuẩn cho mọi list lớn dần vô hạn — cursor-based (docs/05 § 5.4). */
export class CursorPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface CursorPageMeta {
  nextCursor: string | null;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import type { CursorPage } from '@litmatch/common-dtos';

import { Comment } from '../entities/comment.entity';
import { Post, PostAudience } from '../entities/post.entity';
import { PublicProfileDto } from '../../user';

export class CreatePostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ enum: PostAudience, default: PostAudience.Public })
  @IsOptional()
  @IsEnum(PostAudience)
  audience?: PostAudience;
}

export class PostDto {
  @ApiProperty() id!: string;
  @ApiProperty() authorUserId!: string;
  @ApiProperty({ type: () => PublicProfileDto }) author!: PublicProfileDto;
  @ApiProperty({ nullable: true, type: String }) content!: string | null;
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ enum: PostAudience }) audience!: PostAudience;
  @ApiProperty() likeCount!: number;
  @ApiProperty() commentCount!: number;
  @ApiProperty() createdAt!: Date;

  static from(post: Post, author: PublicProfileDto): PostDto {
    const dto = new PostDto();
    dto.id = post.id;
    dto.authorUserId = post.authorUserId;
    dto.author = author;
    dto.content = post.content;
    dto.imageUrl = post.imageUrl;
    dto.audience = post.audience;
    dto.likeCount = post.likeCount;
    dto.commentCount = post.commentCount;
    dto.createdAt = post.createdAt;
    return dto;
  }
}

export class PostsPageDto {
  @ApiProperty({ type: [PostDto] }) items!: PostDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(
    page: CursorPage<Post>,
    authors: ReadonlyMap<string, PublicProfileDto>,
  ): PostsPageDto {
    const dto = new PostsPageDto();
    dto.items = page.items.map((post) =>
      PostDto.from(post, authorFor(authors, post.authorUserId)),
    );
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}

export class CreateCommentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  content!: string;
}

export class CommentDto {
  @ApiProperty() id!: string;
  @ApiProperty() postId!: string;
  @ApiProperty() authorUserId!: string;
  @ApiProperty({ type: () => PublicProfileDto }) author!: PublicProfileDto;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;

  static from(comment: Comment, author: PublicProfileDto): CommentDto {
    const dto = new CommentDto();
    dto.id = comment.id;
    dto.postId = comment.postId;
    dto.authorUserId = comment.authorUserId;
    dto.author = author;
    dto.content = comment.content;
    dto.createdAt = comment.createdAt;
    return dto;
  }
}

export class CommentsPageDto {
  @ApiProperty({ type: [CommentDto] }) items!: CommentDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;

  static from(
    page: CursorPage<Comment>,
    authors: ReadonlyMap<string, PublicProfileDto>,
  ): CommentsPageDto {
    const dto = new CommentsPageDto();
    dto.items = page.items.map((comment) =>
      CommentDto.from(comment, authorFor(authors, comment.authorUserId)),
    );
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}

/** FK tới users bảo đảm luôn có tác giả; thiếu bản ghi là corruption, không được trả DTO nửa vời. */
function authorFor(
  authors: ReadonlyMap<string, PublicProfileDto>,
  userId: string,
): PublicProfileDto {
  const author = authors.get(userId);
  if (!author) throw new Error(`Không tìm thấy tác giả ${userId}`);
  return author;
}

export class ReactionStatusDto {
  @ApiProperty() liked!: boolean;
  @ApiProperty() likeCount!: number;
}

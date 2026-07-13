import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import type { CursorPage } from '@litmatch/common-dtos';

import { Comment } from '../entities/comment.entity';
import { Post } from '../entities/post.entity';

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
}

export class PostDto {
  @ApiProperty() id!: string;
  @ApiProperty() authorUserId!: string;
  @ApiProperty({ nullable: true }) content!: string | null;
  @ApiProperty({ nullable: true }) imageUrl!: string | null;
  @ApiProperty() likeCount!: number;
  @ApiProperty() commentCount!: number;
  @ApiProperty() createdAt!: Date;

  static from(post: Post): PostDto {
    const dto = new PostDto();
    dto.id = post.id;
    dto.authorUserId = post.authorUserId;
    dto.content = post.content;
    dto.imageUrl = post.imageUrl;
    dto.likeCount = post.likeCount;
    dto.commentCount = post.commentCount;
    dto.createdAt = post.createdAt;
    return dto;
  }
}

export class PostsPageDto {
  @ApiProperty({ type: [PostDto] }) items!: PostDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;

  static from(page: CursorPage<Post>): PostsPageDto {
    const dto = new PostsPageDto();
    dto.items = page.items.map(PostDto.from);
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
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;

  static from(comment: Comment): CommentDto {
    const dto = new CommentDto();
    dto.id = comment.id;
    dto.postId = comment.postId;
    dto.authorUserId = comment.authorUserId;
    dto.content = comment.content;
    dto.createdAt = comment.createdAt;
    return dto;
  }
}

export class CommentsPageDto {
  @ApiProperty({ type: [CommentDto] }) items!: CommentDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;

  static from(page: CursorPage<Comment>): CommentsPageDto {
    const dto = new CommentsPageDto();
    dto.items = page.items.map(CommentDto.from);
    dto.nextCursor = page.meta.nextCursor;
    return dto;
  }
}

export class ReactionStatusDto {
  @ApiProperty() liked!: boolean;
  @ApiProperty() likeCount!: number;
}

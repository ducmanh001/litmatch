'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { useUpdateProfile } from '../api';
import { updateProfileSchema } from '../update-profile-schema';

import type { MyProfileDto } from '../../../shared/auth/use-current-user';
import type { UpdateProfileForm } from '../update-profile-schema';

const GENDER_OPTIONS: Array<{ value: MyProfileDto['gender']; label: string }> =
  [
    { value: 'unknown', label: 'Không muốn nói' },
    { value: 'male', label: 'Nam' },
    { value: 'female', label: 'Nữ' },
    { value: 'other', label: 'Khác' },
  ];

export function ProfileForm({ profile }: { profile: MyProfileDto }) {
  const form = useForm<UpdateProfileForm>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      nickname: profile.nickname,
      gender: profile.gender,
      birthDate: profile.birthDate ?? '',
      region: profile.region ?? '',
    },
  });
  const updateProfile = useUpdateProfile();

  const message =
    form.formState.errors.nickname?.message ??
    form.formState.errors.birthDate?.message ??
    form.formState.errors.region?.message ??
    (isApiError(updateProfile.error)
      ? updateProfile.error.message
      : updateProfile.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit((values) => {
    updateProfile.mutate({
      nickname: values.nickname,
      gender: values.gender,
      birthDate: values.birthDate === '' ? undefined : values.birthDate,
      region: values.region === '' ? undefined : values.region,
    });
  });

  return (
    <form className="max-w-md space-y-4" onSubmit={onSubmit} noValidate>
      <div className="space-y-1.5">
        <label htmlFor="nickname" className="text-sm font-medium">
          Biệt danh
        </label>
        <input
          id="nickname"
          type="text"
          className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          {...form.register('nickname')}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="gender" className="text-sm font-medium">
          Giới tính
        </label>
        <select
          id="gender"
          className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          {...form.register('gender')}
        >
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="birthDate" className="text-sm font-medium">
          Ngày sinh
        </label>
        <input
          id="birthDate"
          type="date"
          className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          {...form.register('birthDate')}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="region" className="text-sm font-medium">
          Khu vực (mã ISO 2 ký tự, vd VN)
        </label>
        <input
          id="region"
          type="text"
          maxLength={2}
          className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm uppercase focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          {...form.register('region')}
        />
      </div>

      <button
        type="submit"
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        disabled={updateProfile.isPending}
      >
        {updateProfile.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
      </button>

      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {updateProfile.isSuccess && (
        <p className="text-sm text-primary">Đã lưu hồ sơ.</p>
      )}
    </form>
  );
}

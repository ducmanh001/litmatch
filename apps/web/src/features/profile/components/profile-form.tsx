'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { cn } from '../../../shared/lib/cn';
import { showToast } from '../../../shared/lib/toast-store';
import { useUpdateProfile } from '../api';
import { updateProfileSchema } from '../update-profile-schema';

import type { MyProfileDto } from '../../../shared/auth/use-current-user';
import type { UpdateProfileForm } from '../update-profile-schema';

/** `<form id>` cho phép nút "Lưu" ở header trang /profile/edit submit form này qua thuộc tính
 * HTML `form=` dù nằm ngoài cây DOM của `<form>` — không cần lift state/mutation lên page. */
export const PROFILE_FORM_ID = 'edit-profile-form';

const GENDER_OPTIONS: Array<{ value: MyProfileDto['gender']; label: string }> =
  [
    { value: 'female', label: 'Nữ' },
    { value: 'male', label: 'Nam' },
    { value: 'other', label: 'Khác' },
    { value: 'unknown', label: 'Không muốn nói' },
  ];

/** Bộ tag gợi ý đúng edit-profile.html — tag user tự có từ trước vẫn hiện thêm bên dưới. */
const INTEREST_SUGGESTIONS = [
  'Du lịch',
  'Cà phê',
  'Indie',
  'Đọc sách',
  'Nấu ăn',
  'Gym',
  'Phim ảnh',
  'Chụp ảnh',
  'Thú cưng',
] as const;

const MAX_INTERESTS = 5;

const SEEKING_OPTIONS: Array<{
  value: NonNullable<MyProfileDto['seekingGender']>;
  label: string;
}> = [
  { value: 'female', label: 'Nữ' },
  { value: 'male', label: 'Nam' },
  { value: 'any', label: 'Cả hai' },
];

export function ProfileForm({ profile }: { profile: MyProfileDto }) {
  const form = useForm<UpdateProfileForm>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      nickname: profile.nickname,
      gender: profile.gender,
      birthDate: profile.birthDate ?? '',
      region: profile.region ?? '',
      interests: profile.interests ?? [],
      seekingGender: profile.seekingGender ?? 'any',
      // Mặc định 22–30 đúng edit-profile.html khi user chưa từng khai
      seekingAgeMin: profile.seekingAgeMin ?? 22,
      seekingAgeMax: profile.seekingAgeMax ?? 30,
    },
  });
  const updateProfile = useUpdateProfile();

  const message =
    form.formState.errors.nickname?.message ??
    form.formState.errors.birthDate?.message ??
    form.formState.errors.region?.message ??
    form.formState.errors.interests?.message ??
    (isApiError(updateProfile.error)
      ? updateProfile.error.message
      : updateProfile.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit((values) => {
    updateProfile.mutate(
      {
        nickname: values.nickname,
        gender: values.gender,
        birthDate: values.birthDate === '' ? undefined : values.birthDate,
        region: values.region === '' ? undefined : values.region,
        interests: values.interests,
        seekingGender: values.seekingGender,
        seekingAgeMin: values.seekingAgeMin,
        seekingAgeMax: values.seekingAgeMax,
      },
      {
        // layouts/web/edit-profile.html: lmToast('Đã lưu thay đổi hồ sơ') sau khi lưu thành công.
        onSuccess: () => showToast('Đã lưu thay đổi hồ sơ'),
      },
    );
  });

  const labelClass =
    'mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500';
  const inputClass =
    'h-12 w-full rounded-xl bg-slate-100 px-4 text-sm outline-none focus:ring-2 focus:ring-iris dark:bg-surf2';

  const selectedGender = form.watch('gender');
  const selectedInterests = form.watch('interests');
  const seekingGender = form.watch('seekingGender');
  const seekingAgeMin = form.watch('seekingAgeMin');
  const seekingAgeMax = form.watch('seekingAgeMax');

  // Tag đã lưu từ trước nhưng không thuộc bộ gợi ý vẫn phải hiện để bỏ chọn được
  const interestChoices = [
    ...INTEREST_SUGGESTIONS,
    ...selectedInterests.filter(
      (tag) => !(INTEREST_SUGGESTIONS as readonly string[]).includes(tag),
    ),
  ];

  const toggleInterest = (tag: string) => {
    const current = form.getValues('interests');
    const next = current.includes(tag)
      ? current.filter((item) => item !== tag)
      : current.length < MAX_INTERESTS
        ? [...current, tag]
        : current;
    if (next === current && !current.includes(tag)) {
      showToast(`Chỉ chọn tối đa ${MAX_INTERESTS} sở thích`, 'warn');
      return;
    }
    form.setValue('interests', next, { shouldDirty: true });
  };

  return (
    <form
      id={PROFILE_FORM_ID}
      className="space-y-5"
      onSubmit={onSubmit}
      noValidate
    >
      <div>
        <label htmlFor="nickname" className={labelClass}>
          Tên hiển thị
        </label>
        <input
          id="nickname"
          type="text"
          className={inputClass}
          {...form.register('nickname')}
        />
      </div>

      <div>
        <label htmlFor="birthDate" className={labelClass}>
          Ngày sinh
        </label>
        <input
          id="birthDate"
          type="date"
          className={inputClass}
          {...form.register('birthDate')}
        />
      </div>

      <div>
        <span className={labelClass}>Giới tính</span>
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="Giới tính"
        >
          {GENDER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={selectedGender === option.value}
              onClick={() =>
                form.setValue('gender', option.value, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              className={cn(
                'rounded-full border py-2.5 text-sm font-semibold',
                selectedGender === option.value
                  ? 'border-transparent bg-irisl text-white'
                  : 'border-black/10 bg-transparent dark:border-white/10',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="region" className={labelClass}>
          Khu vực (mã ISO 2 ký tự, vd VN)
        </label>
        <input
          id="region"
          type="text"
          maxLength={2}
          className={`${inputClass} uppercase`}
          {...form.register('region')}
        />
      </div>

      <div>
        <span className={labelClass}>
          Sở thích{' '}
          <span className="font-normal normal-case">
            (chọn tối đa {MAX_INTERESTS})
          </span>
        </span>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Sở thích"
        >
          {interestChoices.map((tag) => {
            const active = selectedInterests.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => toggleInterest(tag)}
                className={cn(
                  'rounded-full border px-3.5 py-2 text-xs font-semibold',
                  active
                    ? 'border-transparent bg-irisl text-white'
                    : 'border-black/10 dark:border-white/10',
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <span className={labelClass}>Đang tìm kiếm</span>
        <div className="space-y-4 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-surf">
          <div>
            <p className="mb-2 text-sm font-semibold">Giới tính quan tâm</p>
            <div
              className="flex gap-2"
              role="group"
              aria-label="Giới tính quan tâm"
            >
              {SEEKING_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={seekingGender === option.value}
                  onClick={() =>
                    form.setValue('seekingGender', option.value, {
                      shouldDirty: true,
                    })
                  }
                  className={cn(
                    'flex-1 rounded-full border py-2 text-xs font-semibold',
                    seekingGender === option.value
                      ? 'border-transparent bg-irisl text-white'
                      : 'border-black/10 dark:border-white/10',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">
              Độ tuổi:{' '}
              <span className="font-normal text-slate-500 dark:text-slate-400">
                {seekingAgeMin} – {seekingAgeMax}
              </span>
            </p>
            <input
              type="range"
              min={18}
              max={45}
              aria-label="Tuổi tối thiểu"
              value={seekingAgeMin}
              onChange={(event) => {
                const value = Number(event.target.value);
                form.setValue('seekingAgeMin', Math.min(value, seekingAgeMax), {
                  shouldDirty: true,
                });
              }}
              className="w-full accent-irisl"
            />
            <input
              type="range"
              min={18}
              max={45}
              aria-label="Tuổi tối đa"
              value={seekingAgeMax}
              onChange={(event) => {
                const value = Number(event.target.value);
                form.setValue('seekingAgeMax', Math.max(value, seekingAgeMin), {
                  shouldDirty: true,
                });
              }}
              className="-mt-1 w-full accent-irisl"
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-full bg-irisl py-3.5 font-bold text-white shadow-lg shadow-iris/30 disabled:opacity-50"
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
        <p className="text-sm font-semibold text-irisl">Đã lưu hồ sơ.</p>
      )}
    </form>
  );
}

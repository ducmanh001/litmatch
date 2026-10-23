export interface OtpSendInput {
  /** Số điện thoại E.164 của người nhận. */
  phone: string;
  /** Nội dung SMS đã ghép mã — KHÔNG được log. */
  message: string;
  /** Định danh không nhạy cảm của bản ghi OTP, để đối soát với nhà cung cấp. */
  reference: string;
}

/**
 * Cổng giao mã OTP tới người dùng qua kênh ngoài (SMS). Adapter ném lỗi khi không giao được; caller
 * (`OtpService`) vô hiệu mã vừa tạo và trả lỗi giao mã. Adapter không được log nội dung/số điện thoại.
 */
export abstract class OtpSenderPort {
  abstract send(input: OtpSendInput): Promise<void>;
}

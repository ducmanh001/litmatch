import {
  ListSupportTicketsQueryDto,
  SupportTicketDto,
  SupportTicketsPageDto,
  UpdateSupportTicketDto,
} from '../../support';

export class AdminListSupportTicketsQueryDto extends ListSupportTicketsQueryDto {}

export class AdminUpdateSupportTicketDto extends UpdateSupportTicketDto {}

export class AdminSupportTicketDto extends SupportTicketDto {}

export class AdminSupportTicketsPageDto extends SupportTicketsPageDto {}

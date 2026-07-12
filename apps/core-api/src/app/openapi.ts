import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import type {
  OperationObject,
  PathItemObject,
  ReferenceObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

export const API_GLOBAL_PREFIX = 'api/v1';
export const API_PREFIX_EXCLUDES = ['health', 'health/live', 'health/ready'];

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
] as const;

/**
 * 1 định nghĩa duy nhất cho OpenAPI document (docs/05 § 5.1): main.ts (serve /docs) và
 * openapi-emit.ts (ghi spec cho frontend codegen — docs/12 § 12.3) cùng gọi hàm này —
 * spec emit ra lệch với Swagger UI là điều không được phép xảy ra.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Litmatch core-api')
      .setVersion('v1')
      .addBearerAuth()
      .build(),
  );
  return wrapResponsesInEnvelope(doc);
}

/**
 * `ResponseEnvelopeInterceptor` bọc mọi response thành công vào `{ data, meta? }` lúc runtime,
 * nhưng `@ApiOkResponse({ type: X })` chỉ mô tả X trần — không bọc lại ở đây thì spec (và mọi
 * type codegen từ nó) nói dối về hình dạng thật của body. Đây là encode thứ 2 của đúng 1 luật
 * envelope (docs/05 § 5.4); đổi hành vi interceptor thì đổi hàm này trong cùng PR.
 * Mirror cả nhánh "controller đã trả { data } sẵn thì giữ nguyên" của interceptor: schema đã có
 * property `data` ở top-level thì không bọc thêm lần nữa.
 */
function wrapResponsesInEnvelope(doc: OpenAPIObject): OpenAPIObject {
  const schemas = doc.components?.schemas ?? {};

  const alreadyEnveloped = (
    schema: SchemaObject | ReferenceObject,
  ): boolean => {
    const resolved =
      '$ref' in schema ? schemas[schema.$ref.split('/').pop() ?? ''] : schema;
    return Boolean(
      resolved && !('$ref' in resolved) && resolved.properties?.['data'],
    );
  };

  for (const pathItem of Object.values(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const operation: OperationObject | undefined = (
        pathItem as PathItemObject
      )[method];
      if (!operation?.responses) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!/^2\d\d$/.test(status)) continue;
        const content = (response as ResponseObject).content?.[
          'application/json'
        ];
        if (!content?.schema || alreadyEnveloped(content.schema)) continue;
        content.schema = {
          type: 'object',
          required: ['data'],
          properties: {
            data: content.schema,
            meta: { type: 'object', additionalProperties: true },
          },
        };
      }
    }
  }
  return doc;
}

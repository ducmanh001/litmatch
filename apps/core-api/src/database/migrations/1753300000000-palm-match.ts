import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 5 — Palm Match (docs/services/palm-match-service.md). Catalog nội dung bói toán
 * giải trí, KHÔNG có bảng lịch sử — kết quả deterministic theo (userId, category, ngày server)
 * tính lại ở `PalmMatchService` mỗi lần gọi (§ 1, § 3). Index `(category, is_active)` phục vụ
 * đúng truy vấn duy nhất của service: lấy toàn bộ template active theo category.
 * Seed: >= 16 dòng/category (love/career/health/general), tiếng Việt, tông giải trí nhẹ nhàng.
 * Category `health` CHỈ mang tính giải trí ("vận may sức khoẻ"), KHÔNG phải tư vấn y khoa thật
 * (docs/10 § Palm Match). Một vài dòng dùng placeholder `{name}` để minh hoạ tính năng thay tên —
 * phần còn lại không dùng, đảm bảo câu vẫn tự nhiên khi client không truyền `targetName`.
 */
export class PalmMatch1753300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE palm_reading_templates (
        id        serial PRIMARY KEY,
        category  varchar(16) NOT NULL,
        content   text        NOT NULL,
        is_active boolean     NOT NULL DEFAULT true,
        CONSTRAINT chk_palm_reading_templates_category
          CHECK (category IN ('love', 'career', 'health', 'general'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_palm_reading_templates_category_active ON palm_reading_templates(category, is_active)`,
    );

    await queryRunner.query(`
      INSERT INTO palm_reading_templates (category, content) VALUES
        ('love', 'Hôm nay đường tình duyên của bạn có dấu hiệu khởi sắc, một tin nhắn bất ngờ có thể khiến bạn mỉm cười.'),
        ('love', '{name}, hôm nay là ngày thích hợp để chủ động nhắn tin trước với người bạn thầm thương.'),
        ('love', 'Một cuộc gặp gỡ tình cờ hôm nay có thể mở ra một mối duyên mới, hãy giữ tâm thế cởi mở.'),
        ('love', 'Tình cảm hiện tại của bạn đang ở giai đoạn ổn định, đừng ngại thể hiện sự quan tâm nhiều hơn.'),
        ('love', '{name} ơi, đôi khi một lời khen chân thành lại là chìa khóa mở cửa trái tim đối phương đấy.'),
        ('love', 'Hôm nay không phải ngày lý tưởng để nói chuyện nghiêm túc về tương lai tình cảm, hãy thư giãn trước đã.'),
        ('love', 'Vận đào hoa của bạn hôm nay khá vượng, rất có thể sẽ có người để ý đến bạn nhiều hơn thường lệ.'),
        ('love', 'Nếu đang độc thân, hôm nay hãy thử mở lòng với những cuộc trò chuyện mới, biết đâu duyên lành đang đến gần.'),
        ('love', '{name}, một chút dí dỏm hài hước hôm nay sẽ giúp bạn ghi điểm trong mắt người ấy.'),
        ('love', 'Đôi khi im lặng cũng là một cách thể hiện sự quan tâm, hôm nay hãy lắng nghe nhiều hơn là nói.'),
        ('love', 'Ngày hôm nay thích hợp để hàn gắn một hiểu lầm nhỏ trong chuyện tình cảm, đừng để nó kéo dài.'),
        ('love', 'Bạn đang toả ra năng lượng tích cực khiến người xung quanh dễ có cảm tình, hãy tận dụng điều đó.'),
        ('love', '{name}, hãy dành thời gian cho người thương hôm nay, một bữa ăn cùng nhau cũng đủ ấm áp rồi.'),
        ('love', 'Một lời xin lỗi chân thành hôm nay có thể hàn gắn được nhiều điều hơn bạn nghĩ.'),
        ('love', 'Trái tim bạn hôm nay có phần nhạy cảm hơn thường ngày, hãy cẩn thận trước khi đưa ra quyết định lớn về tình cảm.'),
        ('love', 'Vận may tình duyên hôm nay ủng hộ những ai dám bày tỏ cảm xúc thật của mình.'),

        ('career', 'Hôm nay là ngày thuận lợi để bạn đề xuất một ý tưởng mới trong công việc.'),
        ('career', '{name}, sự kiên trì của bạn hôm nay sẽ được cấp trên hoặc đồng nghiệp ghi nhận.'),
        ('career', 'Một cơ hội hợp tác bất ngờ có thể xuất hiện hôm nay, hãy lắng nghe kỹ trước khi từ chối.'),
        ('career', 'Hôm nay không phải thời điểm tốt để đưa ra quyết định tài chính quan trọng trong công việc, hãy cân nhắc kỹ.'),
        ('career', '{name} ơi, một cuộc trò chuyện thẳng thắn với đồng nghiệp hôm nay có thể giải quyết được khúc mắc lâu ngày.'),
        ('career', 'Năng lượng làm việc của bạn hôm nay khá dồi dào, đây là lúc thích hợp để hoàn thành việc còn tồn đọng.'),
        ('career', 'Hãy cẩn trọng với những lời hứa hôm nay, chỉ nhận việc trong khả năng để giữ uy tín.'),
        ('career', 'Một sự thay đổi nhỏ trong cách làm việc hôm nay có thể mang lại hiệu quả bất ngờ.'),
        ('career', '{name}, đừng ngại hỏi ý kiến người có kinh nghiệm hôm nay, một lời khuyên đúng lúc rất đáng giá.'),
        ('career', 'Hôm nay thích hợp để lên kế hoạch dài hạn hơn là xử lý việc gấp, hãy dành thời gian suy nghĩ.'),
        ('career', 'Có thể sẽ có một tin vui liên quan đến công việc hoặc học tập đến với bạn trong hôm nay.'),
        ('career', 'Sự tập trung của bạn hôm nay có thể bị phân tán, hãy ưu tiên việc quan trọng nhất trước.'),
        ('career', '{name}, một mối quan hệ công việc cũ có thể mang lại cơ hội mới nếu bạn chủ động liên lạc lại.'),
        ('career', 'Hôm nay là ngày tốt để học thêm một kỹ năng mới, dù chỉ là một bước nhỏ.'),
        ('career', 'Đừng so sánh tiến độ của mình với người khác hôm nay, mỗi người có một nhịp độ riêng.'),
        ('career', 'Vận công danh hôm nay ủng hộ sự chủ động, đừng chờ đợi mà hãy hành động trước.'),

        ('health', 'Hôm nay là ngày thích hợp để bạn dành 10 phút đi bộ hít thở không khí trong lành.'),
        ('health', '{name}, hãy nhớ uống đủ nước hôm nay, cơ thể bạn sẽ cảm ơn bạn vì điều đó.'),
        ('health', 'Một giấc ngủ ngon tối nay sẽ giúp năng lượng của bạn được nạp đầy cho ngày mai.'),
        ('health', 'Hôm nay bạn có xu hướng ngồi lâu một chỗ, hãy đứng dậy vươn vai sau mỗi giờ làm việc.'),
        ('health', '{name} ơi, một bữa ăn nhẹ nhàng đủ chất hôm nay sẽ giúp tinh thần bạn nhẹ nhõm hơn.'),
        ('health', 'Vận may sức khoẻ hôm nay khá ổn định, đừng quên dành chút thời gian thư giãn cho bản thân.'),
        ('health', 'Hôm nay là ngày tốt để thử một bài tập giãn cơ nhẹ nhàng trước khi đi ngủ.'),
        ('health', 'Tinh thần thoải mái hôm nay sẽ giúp bạn cảm thấy tràn đầy sức sống hơn cả ngày dài.'),
        ('health', '{name}, hãy dành ít phút hôm nay để hít thở sâu, cảm giác căng thẳng sẽ dịu đi nhiều.'),
        ('health', 'Hôm nay bạn nên hạn chế thức khuya, một giấc ngủ đủ giấc quý giá hơn bạn nghĩ.'),
        ('health', 'Một tách trà ấm chiều nay có thể giúp bạn cảm thấy dễ chịu hơn sau một ngày bận rộn.'),
        ('health', 'Cơ thể bạn hôm nay đang gửi tín hiệu cần được nghỉ ngơi nhiều hơn, hãy lắng nghe nó.'),
        ('health', '{name}, đi dạo cùng bạn bè hôm nay không chỉ vui mà còn giúp tinh thần sảng khoái hơn.'),
        ('health', 'Hôm nay thích hợp để dọn dẹp không gian sống, một môi trường gọn gàng giúp đầu óc thư thái hơn.'),
        ('health', 'Vận động nhẹ nhàng hôm nay, như vài động tác vươn vai, sẽ giúp bạn tỉnh táo hơn cả ngày.'),
        ('health', 'Hãy nhớ ăn đúng bữa hôm nay, đừng để công việc cuốn bạn quên chăm sóc bản thân.'),

        ('general', 'Hôm nay là một ngày tốt để thử điều gì đó mới mẻ, dù chỉ là một thay đổi nhỏ trong thói quen.'),
        ('general', '{name}, một tin nhắn hỏi thăm bất ngờ hôm nay có thể mang lại niềm vui nho nhỏ cho bạn.'),
        ('general', 'Vận may tổng quan hôm nay khá thuận lợi, hãy giữ tâm trạng lạc quan.'),
        ('general', 'Hôm nay có thể xảy ra một tình huống bất ngờ nhỏ, hãy giữ bình tĩnh để xử lý êm đẹp.'),
        ('general', '{name} ơi, một hành động tử tế nhỏ hôm nay có thể mang lại niềm vui lớn hơn bạn nghĩ.'),
        ('general', 'Hôm nay là ngày thích hợp để sắp xếp lại những việc còn dang dở trong cuộc sống.'),
        ('general', 'Một cuộc gặp gỡ bạn cũ hôm nay có thể mang lại những câu chuyện thú vị.'),
        ('general', 'Hãy tin vào trực giác của mình hôm nay khi phải đưa ra một quyết định nhỏ.'),
        ('general', '{name}, đừng ngại thử một quán ăn mới hôm nay, biết đâu bạn sẽ tìm được món yêu thích.'),
        ('general', 'Hôm nay thích hợp để viết ra vài điều bạn biết ơn, tâm trạng sẽ nhẹ nhàng hơn hẳn.'),
        ('general', 'Một chuyến đi ngắn hôm nay, dù chỉ là dạo quanh khu phố, có thể mang lại cảm hứng mới.'),
        ('general', 'Ngày hôm nay có thể có chút trục trặc nhỏ trong kế hoạch, nhưng mọi thứ sẽ ổn thoả về sau.'),
        ('general', '{name}, hãy dành chút thời gian cho sở thích cá nhân hôm nay, đó là cách nạp lại năng lượng tốt.'),
        ('general', 'Hôm nay là ngày tốt để kết nối lại với gia đình, một cuộc gọi ngắn cũng đủ ấm lòng.'),
        ('general', 'Sự may mắn hôm nay đến từ những điều nhỏ bé, hãy chú ý quan sát xung quanh.'),
        ('general', 'Đừng quá lo lắng về những điều chưa xảy ra hôm nay, hãy tận hưởng hiện tại nhiều hơn.')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS palm_reading_templates`);
  }
}

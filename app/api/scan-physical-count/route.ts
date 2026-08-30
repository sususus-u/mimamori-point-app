// 切手・紙の商品券など「現物」を撮影した写真から、枚数・額面を読み取り合計金額を算出するAPI。
// デジタル画面のスクショ読み取り(/api/scan-account)とはプロンプトが異なるため別エンドポイントにしている。

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "画像がありません" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "サーバー側にAPIキーが設定されていません" },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `この写真には、切手や商品券・ギフトカードなどの現物が写っています。
以下の項目をJSON形式のみで返してください。前置きや説明文、コードブロックの記号は一切付けないでください。

- 写っている枚数を数えてください
- 各枚に印刷されている額面(金額)が読み取れれば、それを合計してください。額面がバラバラな場合はすべて合計してください
- 何の商品券/切手か、名前が印刷されていれば読み取ってください(例:「図書カード」「Amazonギフト券」「切手」など)
- 有効期限が印刷されていれば読み取ってください(印刷されていないことも多いので、その場合はnull)

{
  "name": "商品名(読み取れない場合はnull)",
  "itemCount": 数値のみ(枚数、読み取れない場合はnull),
  "totalAmount": 数値のみ(合計金額。カンマなし。読み取れない場合はnull),
  "expiryDate": "YYYY-MM-DD形式(読み取れない場合はnull)"
}`,
            },
          ],
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "読み取りに失敗しました" }, { status: 500 });
  }
}

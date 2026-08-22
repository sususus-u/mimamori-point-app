// スクリーンショットをClaude(Haiku)に送り、サービス名・残高・単位・期限をJSONで読み取るAPI。
// APIキーはサーバー側の環境変数(ANTHROPIC_API_KEY)から読み込み、クライアントには一切渡さない。

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
        { error: "サーバー側にAPIキーが設定されていません(.env.localのANTHROPIC_API_KEYを確認してください)" },
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
              text: `このスクリーンショットは、電子マネー・ポイント・マイルなどのサービスの残高・期限画面です。
以下の項目をJSON形式のみで返してください。前置きや説明文、コードブロックの記号は一切付けないでください。

一部のポイントサービス(dポイント等)では、合計ポイントの内訳として「期間限定」「用途限定」のようなポイントが別枠で表示されることがあります(例:「合計171P」のうち「期間・用途限定68P」)。このような内訳が見つかった場合のみ limitedPortion を含めてください。見つからない場合は limitedPortion は null にしてください。

**重要:有効期限の割り当てルール**
- 画面に表示されている有効期限が「期間・用途限定」等の内訳に対するものである場合、その期限は必ず limitedPortion.expiryDate に入れてください。トップレベルの expiryDate には入れないでください。
- 通常ポイント/合計ポイント自体に、別途明示された有効期限がある場合のみ、トップレベルの expiryDate に入れてください。
- 画面上に有効期限の表示が1つしかなく、それが内訳(期間限定分)に対する記載である場合、トップレベルの expiryDate は必ず null にしてください(通常分とみなして期限ありにしてはいけません)。

{
  "serviceName": "サービス名(例:PayPay残高、dポイント など。読み取れない場合はnull)",
  "totalBalance": 数値のみ(合計残高。カンマなし。読み取れない場合はnull),
  "balanceUnit": "円 か pt か マイル か 枚 など(読み取れない場合はnull)",
  "expiryDate": "通常分/合計分に明示された有効期限のみ。YYYY-MM-DD形式(なければnull)",
  "limitedPortion": {
    "balance": 数値のみ(期間・用途限定ポイントの金額),
    "expiryDate": "期間・用途限定ポイントの有効期限、YYYY-MM-DD形式(読み取れない場合はnull)"
  } または null
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

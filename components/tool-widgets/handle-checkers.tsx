"use client";

import { useState } from "react";
import { Icon } from "../icons";

function HandleChecker({
  platform,
  rules,
  regex,
  maxLen,
  profileUrl,
}: {
  platform: string;
  rules: string[];
  regex: RegExp;
  maxLen: number;
  profileUrl: (h: string) => string;
}) {
  const [handle, setHandle] = useState("");
  const clean = handle.replace(/^@/, "");
  const valid = clean.length > 0 && clean.length <= maxLen && regex.test(clean);

  return (
    <div>
      <div className="flex items-center gap-1">
        <span className="text-muted">@</span>
        <input
          className="input"
          placeholder={`your${platform.toLowerCase()}handle`}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
      </div>
      {clean && (
        <p className={`mt-2 text-sm font-semibold ${valid ? "text-primary-deep" : "text-danger"}`}>
          {valid ? `Valid ${platform} handle format` : `Not a valid ${platform} handle`}
        </p>
      )}
      {clean && valid && (
        <a
          href={profileUrl(clean)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary-deep hover:underline"
        >
          Check availability on {platform} <Icon name="external" size={12} />
        </a>
      )}
      <ul className="mt-4 flex flex-col gap-1 text-xs text-muted">
        {rules.map((r) => (
          <li key={r}>- {r}</li>
        ))}
      </ul>
    </div>
  );
}

export function InstagramHandleChecker() {
  return (
    <HandleChecker
      platform="Instagram"
      maxLen={30}
      regex={/^[a-zA-Z0-9._]+$/}
      rules={[
        "Up to 30 characters",
        "Letters, numbers, periods and underscores only",
        "No consecutive periods; cannot end with a period",
      ]}
      profileUrl={(h) => `https://www.instagram.com/${h}/`}
    />
  );
}

export function TiktokUsernameChecker() {
  return (
    <HandleChecker
      platform="TikTok"
      maxLen={24}
      regex={/^[a-zA-Z0-9._]+$/}
      rules={["2-24 characters", "Letters, numbers, underscores and periods", "Cannot end with a period"]}
      profileUrl={(h) => `https://www.tiktok.com/@${h}`}
    />
  );
}

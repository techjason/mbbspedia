"use client";

import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import { useDocsSearch } from "fumadocs-core/search/client";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import Mixedbread from "@mixedbread/sdk";
import { useMemo, useState } from "react";

const mixedbreadApiKey = process.env.NEXT_PUBLIC_MIXEDBREAD_API_KEY;
const mixedbreadStoreIdentifier =
  process.env.NEXT_PUBLIC_MIXEDBREAD_STORE_IDENTIFIER;
const mixedbreadBaseUrl = process.env.NEXT_PUBLIC_MIXEDBREAD_BASE_URL;
const mixedbreadConfigured = Boolean(
  mixedbreadApiKey && mixedbreadStoreIdentifier,
);

export default function DocsSearchDialog(props: SharedProps) {
  if (!mixedbreadConfigured) {
    return <MissingConfigSearchDialog {...props} />;
  }

  return <MixedbreadSearchDialog {...props} />;
}

function MixedbreadSearchDialog(props: SharedProps) {
  const { locale } = useI18n();
  const client = useMemo(
    () =>
      new Mixedbread({
        apiKey: mixedbreadApiKey!,
        ...(mixedbreadBaseUrl ? { baseURL: mixedbreadBaseUrl } : {}),
      }),
    [],
  );

  const { search, setSearch, query } = useDocsSearch({
    type: "mixedbread",
    client,
    storeIdentifier: mixedbreadStoreIdentifier!,
    locale,
  });

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== "empty" ? query.data : null} />
        {query.error && (
          <div className="px-3 pb-2 text-xs text-red-400">
            Search request failed. Verify Mixedbread API key and store
            identifier.
          </div>
        )}
        <SearchDialogFooter>
          <a
            href="https://mixedbread.com"
            rel="noreferrer noopener"
            className="ms-auto text-xs text-fd-muted-foreground"
          >
            Search powered by Mixedbread
          </a>
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}

function MissingConfigSearchDialog(props: SharedProps) {
  const [search, setSearch] = useState("");

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={false}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <div className="p-3 text-sm text-fd-muted-foreground">
          Search is not configured. Set{" "}
          <code>NEXT_PUBLIC_MIXEDBREAD_API_KEY</code> and{" "}
          <code>NEXT_PUBLIC_MIXEDBREAD_STORE_IDENTIFIER</code>.
        </div>
      </SearchDialogContent>
    </SearchDialog>
  );
}

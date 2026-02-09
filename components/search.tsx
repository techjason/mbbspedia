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
import { OramaCloud } from "@orama/core";
import { useMemo, useState } from "react";

const oramaCloudProjectId = process.env.NEXT_PUBLIC_ORAMA_PROJECT_ID;
const oramaCloudPublicApiKey = process.env.NEXT_PUBLIC_ORAMA_API_KEY;
const oramaCloudDatasourceId = process.env.NEXT_PUBLIC_ORAMA_DATASOURCE_ID;
const cloudConfigured = Boolean(
  oramaCloudProjectId && oramaCloudPublicApiKey && oramaCloudDatasourceId,
);

export default function DocsSearchDialog(props: SharedProps) {
  if (!cloudConfigured) {
    return <MissingConfigSearchDialog {...props} />;
  }

  return <OramaCloudSearchDialog {...props} />;
}

function OramaCloudSearchDialog(props: SharedProps) {
  const { locale } = useI18n();
  const client = useMemo(
    () =>
      new OramaCloud({
        projectId: oramaCloudProjectId!,
        apiKey: oramaCloudPublicApiKey!,
      }),
    [],
  );

  const { search, setSearch, query } = useDocsSearch({
    type: "orama-cloud",
    client,
    locale,
    params: {
      datasources: [oramaCloudDatasourceId!],
    },
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
            Search request failed. Verify Orama project, datasource, and public API key.
          </div>
        )}
        <SearchDialogFooter>
          <a
            href="https://orama.com"
            rel="noreferrer noopener"
            className="ms-auto text-xs text-fd-muted-foreground"
          >
            Search powered by Orama
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
          Search is not configured. Set <code>NEXT_PUBLIC_ORAMA_PROJECT_ID</code>,{" "}
          <code>NEXT_PUBLIC_ORAMA_DATASOURCE_ID</code>, and{" "}
          <code>NEXT_PUBLIC_ORAMA_API_KEY</code>.
        </div>
      </SearchDialogContent>
    </SearchDialog>
  );
}

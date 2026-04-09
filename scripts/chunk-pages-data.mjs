#!/usr/bin/env node
/**
 * chunk-pages-data.mjs
 * Chunks pages-data.json (7.4MB) into:
 *   public/data/pages/index.json       — cluster index + metadata
 *   public/data/pages/cluster-{id}.json — pages for each cluster
 * 
 * All data preserved, nothing trimmed.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const DASH_DIR = join(import.meta.dirname, '..', 'public', 'data');
const SOURCE_FILE = join(DASH_DIR, 'pages-data.json');
const PAGES_DIR = join(DASH_DIR, 'pages');

function generateClusterId(pattern) {
  // Use first 8 chars of MD5 hash for short, stable IDs
  return createHash('md5').update(pattern).digest('hex').slice(0, 8);
}

function main() {
  console.log('\n📦 Chunking pages-data.json...\n');

  if (!existsSync(SOURCE_FILE)) {
    console.error(`❌ Source file not found: ${SOURCE_FILE}`);
    console.error('   Run pages-data-collector.mjs first');
    process.exit(1);
  }

  console.log(`📖 Reading ${SOURCE_FILE}...`);
  const data = JSON.parse(readFileSync(SOURCE_FILE, 'utf8'));
  
  const { timestamp, dateRange, summary, pages, clusters } = data;
  
  console.log(`   Pages:    ${pages.length}`);
  console.log(`   Clusters: ${clusters.length}`);

  // Group pages by cluster
  console.log('\n🗂️  Grouping pages by cluster...');
  const pagesByCluster = new Map();
  for (const page of pages) {
    const clusterId = generateClusterId(page.cluster);
    let clusterPagesArray = pagesByCluster.get(clusterId);
    if (!clusterPagesArray) {
      clusterPagesArray = [];
      pagesByCluster.set(clusterId, clusterPagesArray);
    }
    clusterPagesArray.push(page);
  }
  console.log(`   ${pagesByCluster.size} cluster groups created`);

  // Create pages directory
  mkdirSync(PAGES_DIR, { recursive: true });

  // Build index
  console.log('\n📋 Building cluster index...');
  const indexClusters = clusters.map(cluster => {
    const clusterId = generateClusterId(cluster.pattern);
    const pageCount = pagesByCluster.get(clusterId)?.length || 0;
    return {
      id: clusterId,
      pattern: cluster.pattern,
      pageCount: cluster.pageCount,
      actualPageCount: pageCount,
      totalClicks: cluster.totalClicks,
      totalSessions: cluster.totalSessions,
      totalImpressions: cluster.totalImpressions,
      totalUsers: cluster.totalUsers,
      totalPageviews: cluster.totalPageviews,
      totalConversions: cluster.totalConversions,
      avgPosition: cluster.avgPosition,
      avgBounceRate: cluster.avgBounceRate,
      indexedCount: cluster.indexedCount,
      indexedPct: cluster.indexedPct,
    };
  });

  const index = {
    timestamp,
    dateRange,
    summary,
    clusters: indexClusters,
  };

  // Write index
  const indexPath = join(PAGES_DIR, 'index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
  const indexSize = Buffer.byteLength(JSON.stringify(index)) / 1024;
  console.log(`✅ Written ${indexPath} (${indexSize.toFixed(1)} KB)`);

  // Write cluster files
  console.log('\n💾 Writing cluster files...');
  let totalSize = 0;
  let maxClusterSize = 0;
  let largestCluster = '';
  
  for (const [clusterId, clusterPages] of pagesByCluster) {
    const clusterPattern = clusterPages[0]?.cluster || clusterId;
    const clusterData = {
      pattern: clusterPattern,
      pages: clusterPages,
    };
    
    const clusterPath = join(PAGES_DIR, `cluster-${clusterId}.json`);
    const json = JSON.stringify(clusterData);
    writeFileSync(clusterPath, json);
    
    const sizeKB = Buffer.byteLength(json) / 1024;
    totalSize += sizeKB;
    
    if (sizeKB > maxClusterSize) {
      maxClusterSize = sizeKB;
      largestCluster = clusterPattern;
    }
  }

  console.log(`✅ Written ${pagesByCluster.size} cluster files`);
  console.log(`   Total size: ${(totalSize / 1024).toFixed(2)} MB`);
  console.log(`   Largest cluster: ${largestCluster} (${maxClusterSize.toFixed(1)} KB)`);

  // Verify data integrity
  console.log('\n🔍 Verifying data integrity...');
  let totalPages = 0;
  for (const clusterPages of pagesByCluster.values()) {
    totalPages += clusterPages.length;
  }
  
  if (totalPages !== pages.length) {
    console.error(`❌ Data loss detected! Original: ${pages.length}, chunked: ${totalPages}`);
    process.exit(1);
  }
  
  console.log(`✅ All ${totalPages} pages preserved`);

  // Summary
  console.log('\n📊 Chunking complete!');
  console.log(`   Index:       ${indexSize.toFixed(1)} KB`);
  console.log(`   Clusters:    ${pagesByCluster.size} files`);
  console.log(`   Avg/cluster: ${(totalSize / pagesByCluster.size).toFixed(1)} KB`);
  console.log(`\n   Output: ${PAGES_DIR}/`);
}

(async () => {
  await main();
})().catch(e => {
  console.error('\n💥 Fatal error:', e);
  process.exit(1);
});

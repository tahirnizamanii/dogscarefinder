// src/lib/schemas.js
const SITE_URL = "https://dogcarefinder.com";
const SITE_NAME = "DogCareFinder";
const SITE_LOGO = `${SITE_URL}/logo.png`;
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.jpg`;

// ═══════════════════════════════════════════════════════════════
// SITEWIDE — Organization + WebSite (used in every page via BaseLayout)
// ═══════════════════════════════════════════════════════════════

export function organizationSchema() {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: "Dog Care Finder",
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      "@id": `${SITE_URL}/#logo`,
      url: SITE_LOGO,
      contentUrl: SITE_LOGO,
      width: 512,
      height: 512,
      caption: SITE_NAME,
    },
    image: { "@id": `${SITE_URL}/#logo` },
    description:
      "The most complete canine services directory in the United States. Find groomers, trainers, boarding, vets, therapy dogs, and every dog care professional by state, city, and county.",
    sameAs: [
      "https://www.facebook.com/dogcarefinder",
      "https://www.instagram.com/dogcarefinder",
      "https://twitter.com/dogcarefinder",
      "https://www.tiktok.com/@dogcarefinder",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "info@dogcarefinder.com",
        availableLanguage: ["English"],
        areaServed: "US",
      },
    ],
    address: {
      "@type": "PostalAddress",
      addressCountry: "US",
    },
    foundingDate: "2026",
  };
}

export function websiteSchema() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME,
    description:
      "Find every dog care service near you — groomers, trainers, boarding, vets, therapy dogs and more. Browse by state, city, and category.",
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-US",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// PAGE-LEVEL — WebPage + BreadcrumbList
// ═══════════════════════════════════════════════════════════════

export function webPageSchema(name, description, url, image = DEFAULT_OG_IMAGE) {
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: image,
    },
    inLanguage: "en-US",
    datePublished: new Date().toISOString().split("T")[0],
    dateModified: new Date().toISOString().split("T")[0],
  };
}

export function breadcrumbSchema(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: {
        "@type": "WebPage",
        "@id": item.url,
        url: item.url,
        name: item.name,
      },
    })),
  };
}

// ═══════════════════════════════════════════════════════════════
// LOCAL BUSINESS — for individual providers
// ═══════════════════════════════════════════════════════════════

const CATEGORY_TYPE_MAP = {
  Groomers: "PetGroomer",
  Trainers: "LocalBusiness",
  Boarding: "LodgingBusiness",
  Vets: "VeterinaryCare",
  Therapy: "LocalBusiness",
};

export function localBusinessSchema(provider, categoryDisplay) {
  const type = CATEGORY_TYPE_MAP[categoryDisplay] || "LocalBusiness";

  const schema = {
    "@type": type,
    "@id": `${SITE_URL}/provider/${provider.id}#localbusiness`,
    name: provider.businessName,
    description:
      provider.description ||
      `${provider.businessName} — trusted ${categoryDisplay?.toLowerCase() || "dog care"} provider in ${provider.city}, ${provider.state}.`,
    url: provider.website || `${SITE_URL}/provider/${provider.id}`,
    telephone: provider.phone || undefined,
    image: provider.image || DEFAULT_OG_IMAGE,
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: provider.streetAddress || undefined,
      addressLocality: provider.city,
      addressRegion: provider.state,
      postalCode: provider.zipCode || undefined,
      addressCountry: "US",
    },
    geo: provider.latitude && provider.longitude
      ? {
          "@type": "GeoCoordinates",
          latitude: provider.latitude,
          longitude: provider.longitude,
        }
      : undefined,
    areaServed: [
      {
        "@type": "City",
        name: provider.city,
        containedInPlace: {
          "@type": "State",
          name: provider.state,
        },
      },
    ],
    serviceArea: {
      "@type": "GeoCircle",
      geoMidpoint: {
        "@type": "GeoCoordinates",
        latitude: provider.latitude || 39.8283,
        longitude: provider.longitude || -98.5795,
      },
      geoRadius: "40000",
    },
    openingHoursSpecification: provider.openingHours
      ? provider.openingHours
      : undefined,
    aggregateRating:
      provider.rating !== null && provider.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: provider.rating,
            reviewCount: provider.reviewCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };

  return schema;
}

// ═══════════════════════════════════════════════════════════════
// ITEM LIST — for collections of providers
// ═══════════════════════════════════════════════════════════════

export function itemListSchema(name, description, url, providers, categoryDisplay) {
  return {
    "@type": "ItemList",
    "@id": `${url}#itemlist`,
    name,
    description,
    url,
    numberOfItems: providers.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: providers.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: localBusinessSchema(p, categoryDisplay || p.category),
    })),
  };
}

// ═══════════════════════════════════════════════════════════════
// SERVICE — for category-level pages
// ═══════════════════════════════════════════════════════════════

export function serviceSchema(name, description, url, areaServed) {
  return {
    "@type": "Service",
    "@id": `${url}#service`,
    name,
    description,
    url,
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed,
    serviceType: name,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      priceCurrency: "USD",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${name} Directory`,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// FAQ PAGE — for question/answer sections
// ═══════════════════════════════════════════════════════════════

export function faqSchema(faqs) {
  return {
    "@type": "FAQPage",
    "@id": `#faq-${Date.now()}`,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

// ═══════════════════════════════════════════════════════════════
// ARTICLE / BLOG POST
// ═══════════════════════════════════════════════════════════════

export function articleSchema(post, url) {
  const heroImage = post.featuredImage || DEFAULT_OG_IMAGE;
  const wordCount = (post.content || "")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: post.title,
    description: post.metaDescription || post.excerpt || post.title,
    image: [
      {
        "@type": "ImageObject",
        url: heroImage,
        width: 1200,
        height: 800,
      },
    ],
    datePublished: post.publishDate,
    dateModified: post.updatedDate || post.publishDate,
    author: {
      "@type": "Organization",
      name: post.author || "DogCareFinder Team",
      url: SITE_URL,
    },
    publisher: {
      "@id": `${SITE_URL}/#organization`,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    keywords: post.keywords || post.category,
    articleSection: post.category,
    wordCount,
    timeRequired: `PT${post.readTime || 5}M`,
    inLanguage: "en-US",
    isAccessibleForFree: true,
    commentCount: 0,
    copyrightYear: new Date().getFullYear(),
  };
}

// ═══════════════════════════════════════════════════════════════
// HOME PAGE — Combination schema
// ═══════════════════════════════════════════════════════════════

export function homePageSchema(totalListings, totalStates, categories) {
  return {
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/#homepage`,
    url: SITE_URL,
    name: "DogCareFinder — Find Every Dog Care Service Near You",
    description: `Browse ${totalListings} verified dog care providers across ${totalStates} states. Find groomers, trainers, boarding, vets, and therapy dogs near you.`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
    mainEntity: {
      "@type": "ItemList",
      name: "Dog Care Service Categories",
      itemListElement: categories.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `Dog ${c.name}`,
        url: `${SITE_URL}/#${c.slug || c.name.toLowerCase()}`,
      })),
    },
    inLanguage: "en-US",
  };
}

// ═══════════════════════════════════════════════════════════════
// HOW-TO — for guide-type blog posts
// ═══════════════════════════════════════════════════════════════

export function howToSchema(post, url, steps) {
  return {
    "@type": "HowTo",
    "@id": `${url}#howto`,
    name: post.title,
    description: post.excerpt,
    image: post.featuredImage || DEFAULT_OG_IMAGE,
    totalTime: `PT${post.readTime || 5}M`,
    step: steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
      url: `${url}#step-${i + 1}`,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════
// PERSON / AUTHOR (used within articles)
// ═══════════════════════════════════════════════════════════════

export function authorSchema(name = "DogCareFinder Team") {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#author`,
    name,
    url: SITE_URL,
    logo: { "@id": `${SITE_URL}/#logo` },
  };
}

// ═══════════════════════════════════════════════════════════════
// VIDEO OBJECT — for future video content
// ═══════════════════════════════════════════════════════════════

export function videoSchema(name, description, thumbnailUrl, uploadDate, duration, contentUrl) {
  return {
    "@type": "VideoObject",
    name,
    description,
    thumbnailUrl: [thumbnailUrl],
    uploadDate,
    duration,
    contentUrl,
    embedUrl: contentUrl,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

// ═══════════════════════════════════════════════════════════════
// REVIEW / RATING (for individual provider reviews)
// ═══════════════════════════════════════════════════════════════

export function reviewSchema(review, provider) {
  return {
    "@type": "Review",
    itemReviewed: {
      "@type": "LocalBusiness",
      name: provider.businessName,
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.rating,
      bestRating: 5,
      worstRating: 1,
    },
    author: {
      "@type": "Person",
      name: review.authorName,
    },
    reviewBody: review.text,
    datePublished: review.date,
  };
}

// ═══════════════════════════════════════════════════════════════
// COMBINE INTO @graph — the final schema object for a page
// ═══════════════════════════════════════════════════════════════

export function buildGraph(nodes) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean),
  };
}
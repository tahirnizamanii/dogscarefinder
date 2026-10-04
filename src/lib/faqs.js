// src/lib/faqs.js

/**
 * Generates 5 unique FAQs for a specific city + category combination.
 * Every page gets different questions/answers, avoiding duplicate content.
 */
export function generateCategoryFaqs(categoryDisplay, cityDisplay, stateDisplay, providers) {
  const count = providers.length;
  const avgRating = count > 0
    ? (providers.reduce((s, p) => s + (p.rating ?? 0), 0) / count).toFixed(1)
    : "N/A";
  const topRated = [...providers].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

  return [
    {
      question: `How many ${categoryDisplay.toLowerCase()} are there in ${cityDisplay}, ${stateDisplay}?`,
      answer: `There are currently ${count} ${categoryDisplay.toLowerCase()} listed in our ${cityDisplay} directory. Each one is verified and regularly reviewed by pet owners in the area.`,
    },
    {
      question: `What is the average rating for ${categoryDisplay.toLowerCase()} in ${cityDisplay}?`,
      answer: `The average customer rating for ${categoryDisplay.toLowerCase()} in ${cityDisplay}, ${stateDisplay} is ${avgRating} out of 5 stars, based on verified reviews from real dog owners.`,
    },
    {
      question: `Who is the top-rated ${categoryDisplay.slice(0, -1).toLowerCase()} in ${cityDisplay}?`,
      answer: topRated
        ? `${topRated.businessName} is the highest-rated provider in our ${cityDisplay} ${categoryDisplay.toLowerCase()} directory, with a ${topRated.rating} star rating from ${topRated.reviewCount} reviews.`
        : `We're currently adding top-rated ${categoryDisplay.toLowerCase()} in ${cityDisplay}. Check back soon.`,
    },
    {
      question: `How do I choose the right ${categoryDisplay.slice(0, -1).toLowerCase()} in ${cityDisplay}?`,
      answer: `Look for providers with high review counts (50+), verified contact information, and a rating of 4.5 or higher. All providers listed here have been screened for accuracy. Consider proximity to your home, service specialization, and pricing transparency before booking.`,
    },
    {
      question: `Are there affordable ${categoryDisplay.toLowerCase()} in ${cityDisplay}?`,
      answer: `Yes — most ${categoryDisplay.toLowerCase()} in ${cityDisplay} offer free consultations or quotes. Call directly using the phone numbers listed to ask about current pricing, package deals, and first-time customer discounts.`,
    },
  ];
}

/**
 * Generates 4 state-level FAQs.
 */
export function generateStateFaqs(stateDisplay, totalProviders, cityCount, categoryCount) {
  return [
    {
      question: `How many dog care providers are in ${stateDisplay}?`,
      answer: `We currently list ${totalProviders} verified dog care providers across ${cityCount} cities in ${stateDisplay}, spanning ${categoryCount} service categories.`,
    },
    {
      question: `What types of dog services are available in ${stateDisplay}?`,
      answer: `Dog care services in ${stateDisplay} include grooming, training, boarding, veterinary care, and therapy services. Each category lists local providers with verified contact information and reviews.`,
    },
    {
      question: `Which city in ${stateDisplay} has the most dog care providers?`,
      answer: `Our directory covers all major cities in ${stateDisplay}. Browse the city list above to find providers in your specific area.`,
    },
    {
      question: `How do I list my dog care business in ${stateDisplay}?`,
      answer: `Visit our List Your Business page to submit your ${stateDisplay} dog care business. Free listings are available, and paid tiers unlock premium placement and additional features.`,
    },
  ];
}

/**
 * Generates 4 city-level FAQs.
 */
export function generateCityFaqs(cityDisplay, stateDisplay, totalProviders, categories) {
  return [
    {
      question: `How many dog care providers are in ${cityDisplay}, ${stateDisplay}?`,
      answer: `We list ${totalProviders} verified dog care providers in ${cityDisplay}, ${stateDisplay}, covering ${categories.length} service categories including grooming, training, boarding, and veterinary care.`,
    },
    {
      question: `What dog services are available in ${cityDisplay}?`,
      answer: `Dog care services in ${cityDisplay} include: ${categories.map((c) => c.name).join(", ")}. Click any category to browse local providers with verified reviews and contact info.`,
    },
    {
      question: `Is there emergency vet care in ${cityDisplay}?`,
      answer: `Yes — browse our Vets category in ${cityDisplay} to find emergency and after-hours veterinary services. Call ahead to confirm hours and availability.`,
    },
    {
      question: `How do I find the best dog groomer in ${cityDisplay}?`,
      answer: `Start with our Groomers category, filter by rating and reviews, then call providers directly. The highest-rated groomers in ${cityDisplay} typically book 1–2 weeks in advance.`,
    },
  ];
}
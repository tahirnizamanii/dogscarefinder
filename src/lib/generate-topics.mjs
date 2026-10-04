// scripts/generate-topics.mjs
import fs from "fs";

const BREEDS = [
  "Labrador Retriever", "Golden Retriever", "German Shepherd", "French Bulldog",
  "Bulldog", "Poodle", "Beagle", "Rottweiler", "Yorkshire Terrier", "Dachshund",
  "Siberian Husky", "Shih Tzu", "Border Collie", "Chihuahua", "Cocker Spaniel",
  "Great Dane", "Doberman", "Australian Shepherd", "Boxer", "Pomeranian",
  "Boston Terrier", "Maltese", "Bichon Frise", "Havanese", "Shiba Inu",
  "Corgi", "Bernese Mountain Dog", "Cavalier King Charles Spaniel", "Pit Bull",
  "Akita", "Mastiff", "Alaskan Malamute", "Newfoundland", "St. Bernard", "Vizsla",
  "Weimaraner", "Whippet", "Greyhound", "Basset Hound", "Bloodhound",
];

const CITIES = [
  "Austin TX", "Los Angeles CA", "New York NY", "Chicago IL", "Houston TX",
  "Phoenix AZ", "Philadelphia PA", "San Antonio TX", "San Diego CA", "Dallas TX",
  "Seattle WA", "Denver CO", "Boston MA", "Miami FL", "Atlanta GA",
  "Portland OR", "Nashville TN", "Las Vegas NV", "Minneapolis MN", "Detroit MI",
];

function breedTopics() {
  const topics = [];
  for (const breed of BREEDS) {
    topics.push(
      { title: `${breed} Grooming Guide: Complete Care Tips`, category: "Grooming" },
      { title: `How to Train a ${breed}: Step-by-Step`, category: "Training" },
      { title: `Common ${breed} Health Issues to Watch For`, category: "Health" },
      { title: `Best Diet for ${breed}: Nutrition Guide`, category: "Nutrition" },
      { title: `${breed} Behavior Problems and Solutions`, category: "Behavior" },
      { title: `Are ${breed} Good Apartment Dogs?`, category: "Lifestyle" },
      { title: `${breed} Puppy Training: First 12 Weeks`, category: "Training" },
      { title: `How Much Exercise Does a ${breed} Need?`, category: "Health" },
      { title: `${breed} Dental Care: Complete Guide`, category: "Grooming" },
      { title: `Best Food for Senior ${breed}`, category: "Nutrition" },
    );
  }
  return topics;
}

function cityTopics() {
  const topics = [];
  const services = ["Dog Groomers", "Dog Trainers", "Veterinarians", "Dog Boarding", "Dog Daycare"];
  for (const city of CITIES) {
    for (const service of services) {
      topics.push({ title: `How to Choose the Best ${service} in ${city}`, category: "Grooming" });
      topics.push({ title: `${service} in ${city}: Complete Directory Guide`, category: "Grooming" });
    }
  }
  return topics;
}

function evergreenTopics() {
  return [
    { title: "How Often Should You Bathe Your Dog?", category: "Grooming" },
    { title: "Complete Guide to Dog Nail Trimming", category: "Grooming" },
    { title: "How to Brush Your Dog's Teeth Properly", category: "Grooming" },
    { title: "Best Dog Grooming Tools for Home Use", category: "Grooming" },
    { title: "How to Groom a Dog With Matted Fur", category: "Grooming" },
    { title: "Dog Bathing 101: Temperature, Products, and Tips", category: "Grooming" },
    { title: "How to Stop Dog Shedding: 10 Proven Methods", category: "Grooming" },
    { title: "Dog Haircut Styles: A Visual Guide", category: "Grooming" },
    { title: "How to Clean Dog Ears Safely", category: "Grooming" },
    { title: "Winter Dog Grooming: Cold Weather Care", category: "Grooming" },
    { title: "How to Teach Your Dog to Sit, Stay, and Come", category: "Training" },
    { title: "Puppy Crate Training: Day-by-Day Guide", category: "Training" },
    { title: "How to Stop Puppy Biting: 5 Methods That Work", category: "Training" },
    { title: "Leash Training a Puppy: Complete Walkthrough", category: "Training" },
    { title: "How to Teach Your Dog to Fetch", category: "Training" },
    { title: "Potty Training a Puppy: 7-Day Plan", category: "Training" },
    { title: "How to Train a Dog to Stop Barking", category: "Training" },
    { title: "Dog Clicker Training: Beginner's Guide", category: "Training" },
    { title: "How to Teach Your Dog to Stay Home Alone", category: "Training" },
    { title: "Advanced Dog Training Commands for Every Owner", category: "Training" },
    { title: "Dog Vaccination Schedule: Complete Chart", category: "Health" },
    { title: "Signs Your Dog Is in Pain: 15 Warning Signs", category: "Health" },
    { title: "Dog Dental Health: Complete Guide", category: "Health" },
    { title: "Flea and Tick Prevention for Dogs", category: "Health" },
    { title: "How to Check Your Dog's Vital Signs", category: "Health" },
    { title: "Common Dog Illnesses and How to Spot Them", category: "Health" },
    { title: "Dog Emergency First Aid: What to Do", category: "Health" },
    { title: "How to Tell If Your Dog Has a Fever", category: "Health" },
    { title: "Senior Dog Health: Complete Care Guide", category: "Health" },
    { title: "Hip Dysplasia in Dogs: Signs and Treatment", category: "Health" },
    { title: "Best Dog Food Brands: 2026 Complete Guide", category: "Nutrition" },
    { title: "Raw Food Diet for Dogs: Complete Guide", category: "Nutrition" },
    { title: "How Much Should You Feed Your Dog?", category: "Nutrition" },
    { title: "Best Dog Treats for Training and Health", category: "Nutrition" },
    { title: "Human Foods That Are Safe for Dogs", category: "Nutrition" },
    { title: "Foods That Are Toxic to Dogs", category: "Nutrition" },
    { title: "Grain-Free Dog Food: Pros and Cons", category: "Nutrition" },
    { title: "How to Switch Dog Food Without Upset Stomach", category: "Nutrition" },
    { title: "Best Dog Food for Allergies", category: "Nutrition" },
    { title: "Homemade Dog Food Recipes: Vet-Approved", category: "Nutrition" },
    { title: "Why Does My Dog Follow Me Everywhere?", category: "Behavior" },
    { title: "Dog Separation Anxiety: Complete Solutions", category: "Behavior" },
    { title: "Why Do Dogs Lick Their Paws?", category: "Behavior" },
    { title: "Dog Tail Wagging Meanings Explained", category: "Behavior" },
    { title: "Why Does My Dog Stare at Me?", category: "Behavior" },
    { title: "How to Introduce Two Dogs Safely", category: "Behavior" },
    { title: "Why Dogs Dig and How to Stop It", category: "Behavior" },
    { title: "Dog Aggression: Causes and Solutions", category: "Behavior" },
    { title: "Understanding Dog Body Language", category: "Behavior" },
    { title: "Why Does My Dog Eat Grass?", category: "Behavior" },
    { title: "How to Choose a Dog Boarding Facility", category: "Boarding" },
    { title: "Dog Boarding vs Dog Sitting: Complete Comparison", category: "Boarding" },
    { title: "How to Prepare Your Dog for Boarding", category: "Boarding" },
    { title: "In-Home Dog Boarding: What to Know", category: "Boarding" },
    { title: "Boarding Your Dog With Separation Anxiety", category: "Boarding" },
    { title: "Best Dog Boarding for Senior Dogs", category: "Boarding" },
    { title: "Dog Boarding Costs: Complete Pricing Guide", category: "Boarding" },
    { title: "Long-Term Dog Boarding: What to Know", category: "Boarding" },
    { title: "Puppy Boarding: When and How to Start", category: "Boarding" },
    { title: "Dog Boarding Checklist: What to Pack", category: "Boarding" },
    { title: "Best Dog Breeds for Families With Kids", category: "Lifestyle" },
    { title: "Best Dogs for First-Time Owners", category: "Lifestyle" },
    { title: "Best Hypoallergenic Dog Breeds", category: "Lifestyle" },
    { title: "Best Dogs for Apartments", category: "Lifestyle" },
    { title: "Best Dogs for Seniors", category: "Lifestyle" },
    { title: "Working Dog Breeds: Complete Guide", category: "Lifestyle" },
    { title: "Best Dogs for Active People", category: "Lifestyle" },
    { title: "How to Travel With a Dog: Complete Guide", category: "Lifestyle" },
    { title: "Dog-Friendly Vacations: Planning Guide", category: "Lifestyle" },
    { title: "Bringing Home a Rescue Dog: First 30 Days", category: "Lifestyle" },
  ];
}

function dedupe(topics) {
  const seen = new Set();
  return topics.filter((t) => {
    const k = t.title.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const all = dedupe([...evergreenTopics(), ...breedTopics(), ...cityTopics()]);

// Shuffle
for (let i = all.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [all[i], all[j]] = [all[j], all[i]];
}

fs.writeFileSync("topics.json", JSON.stringify(all, null, 2));

console.log(`✅ Generated ${all.length} unique topics`);
console.log(`   Saved to: topics.json`);
const counts = {};
for (const t of all) counts[t.category] = (counts[t.category] || 0) + 1;
console.log(`\nBy category:`);
for (const [cat, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${cat}: ${n}`);
}
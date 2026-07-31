"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useCart } from "@/context/cart-context";
import { useParams } from "next/navigation";
import { productsApi, reviewsApi, uploadsApi, type Product, type Review } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, ShoppingCart, Heart, RefreshCw, Truck,
  Check, ChevronDown, ChevronUp, ArrowLeft,
  Award, Info, Camera, X, Send, Loader2, MessageSquare
} from "lucide-react";
import Footer from "@/components/Footer";
import { getGradeConfig } from "@/lib/grades";
import { GradeBadge } from "@/components/GradeBadge";
import ProductImage from "@/components/ProductImage";
import { isOtherCategory } from "@/lib/other-categories";

export default function ProductDetailPage() {
  const params = useParams();
  const categorySlug = params?.category as string;
  const slug = params?.slug as string;
  // "films", "games", "storage" etc. don't have their own /shop/<category>
  // page — they're subsections of /shop/others, so the back-link must point
  // there instead (with a hash to jump straight to that section).
  const decodedCategory = decodeURIComponent(categorySlug || "");
  const backHref = isOtherCategory(decodedCategory)
    ? `/shop/others#${decodedCategory.toLowerCase()}`
    : `/shop/${categorySlug}`;

  const [product, setProduct] = useState<Product | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("description");
  const [wishlisted, setWishlisted] = useState(false);
  const { addItem } = useCart();

  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewName, setReviewName] = useState("");
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [reviewPreviews, setReviewPreviews] = useState<string[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [hoverRating, setHoverRating] = useState(0);
  const reviewFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoadingProduct(true);
    productsApi.bySlug(slug)
      .then(p => { 
        setProduct(p);
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        });
      })
      .catch(() => {})
      .finally(() => {
        setLoadingProduct(false);
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        });
      });
  }, [slug]);

  useEffect(() => {
    if (!product) return;
    setLoadingReviews(true);
    reviewsApi.list(product.id)
      .then(setReviews)
      .catch(() => {})
      .finally(() => setLoadingReviews(false));
  }, [product?.id]);

  function buildPreviews(files: File[], oldPreviews: string[]): string[] {
    // Revoke all existing object URLs to prevent memory leaks
    oldPreviews.forEach(url => URL.revokeObjectURL(url));
    return files.map(f => URL.createObjectURL(f));
  }

  function handleReviewImages(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, 5 - reviewImages.length);
    const newFiles = [...reviewImages, ...picked].slice(0, 5);
    // Reset input so the same file can be re-selected after removal
    if (reviewFileRef.current) reviewFileRef.current.value = "";
    setReviewImages(newFiles);
    setReviewPreviews(prev => buildPreviews(newFiles, prev));
  }

  function removeReviewImage(idx: number) {
    const next = reviewImages.filter((_, i) => i !== idx);
    setReviewImages(next);
    setReviewPreviews(prev => buildPreviews(next, prev));
  }

  async function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!product || !reviewBody.trim() || reviewRating < 1) return;
    setSubmittingReview(true);
    setReviewError("");
    try {
      const uploaded: string[] = [];
      for (const file of reviewImages) {
        const { filePath } = await uploadsApi.reviewImage(file);
        uploaded.push(filePath);
      }
      await reviewsApi.create(product.id, {
        guestName: reviewName.trim() || undefined,
        rating: reviewRating,
        body: reviewBody.trim(),
        images: uploaded,
      });
      setReviewSubmitted(true);
      setReviewBody("");
      setReviewName("");
      setReviewRating(5);
      setReviewPreviews(prev => { prev.forEach(url => URL.revokeObjectURL(url)); return []; });
      setReviewImages([]);
    } catch (err: any) {
      setReviewError(err?.message ?? "Something went wrong. Please try again.");
    }
    setSubmittingReview(false);
  }

  async function handleAddToCart() {
    if (!product) return;
    try {
      await addItem({
        productId: product.id,
        quantity: 1,
        price: product.price ?? 0,
        name: product.name,
        slug: product.slug,
        image: product.images[0],
      });
    } catch {}
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
  }

  if (loadingProduct) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground font-sans selection:bg-accent selection:text-white">
        <main className="flex-1 mx-auto max-w-7xl px-4 py-12 w-full">
          <div className="grid lg:grid-cols-2 gap-16 animate-pulse">
            <div className="space-y-4">
              <div className="bg-white rounded-[32px] aspect-square" />
              <div className="flex gap-4">
                {[...Array(4)].map((_,i) => <div key={i} className="h-24 w-24 rounded-[20px] bg-white" />)}
              </div>
            </div>
            <div className="space-y-6 pt-4">
              <div className="h-6 bg-zinc-200 rounded-full w-1/4" />
              <div className="h-12 bg-zinc-200 rounded-full w-3/4" />
              <div className="h-8 bg-zinc-200 rounded-full w-1/4" />
              <div className="h-16 bg-zinc-200 rounded-[16px] w-full" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground font-sans selection:bg-accent selection:text-white">
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold mb-4">Product not found</p>
            <a href={backHref} className="h-12 px-8 bg-black text-white rounded-2xl font-bold inline-flex items-center">
              Back to {decodeURIComponent(categorySlug)}
            </a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const savings = product.comparePrice ? product.comparePrice - (product.price ?? 0) : 0;
  const images = product.images.length > 0 ? product.images : ["https://picsum.photos/seed/placeholder/600/600"];
  // Attributes (Color, Edition, etc.) take priority over the generic specs bag they overlap with.
  const specs = { ...(product.attributes ?? {}), ...(product.specs as Record<string, unknown>) };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-sans selection:bg-accent selection:text-white">

      {/* Breadcrumb */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wide min-w-0">
          <a href={backHref} className="hover:text-black flex items-center gap-1 shrink-0 min-w-0 p-2 -ml-2 -my-2 rounded-lg hover:bg-zinc-100 transition-colors">
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{decodeURIComponent(categorySlug)}</span>
          </a>
          <span className="shrink-0">/</span>
          <span className="text-black truncate min-w-0">{product.name}</span>
        </div>
      </div>

      <main className="flex-1 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 md:py-12 w-full">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">

          {/* Left — Image Gallery */}
          <div className="lg:sticky lg:top-24 h-max space-y-4 min-w-0">
            <div className="bg-white rounded-[32px] border border-zinc-200 p-4 sm:p-8 flex flex-col items-center justify-center relative overflow-hidden">
              <button
                onClick={() => setWishlisted(w => !w)}
                className="absolute top-6 right-6 h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors z-10"
              >
                <Heart className={`h-5 w-5 transition-colors ${wishlisted ? "fill-red-500 text-red-500" : "text-black"}`} />
              </button>
              <div className="w-full max-w-[400px] aspect-square relative flex items-center justify-center bg-image-light rounded-[24px] p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeImage}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="h-full w-full"
                  >
                    <ProductImage src={images[activeImage]} alt={product.name} hover={false} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {images.length > 1 && (
              <div className="flex gap-4 overflow-x-auto scrollbar-hide snap-x pb-2">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`relative shrink-0 snap-center h-24 w-24 rounded-[20px] overflow-hidden bg-image-light border-2 transition-all ${
                      activeImage === i ? "border-black dark:border-white shadow-md" : "border-zinc-200 dark:border-zinc-800 opacity-60 hover:opacity-100 hover:border-zinc-400"
                    }`}
                  >
                    <ProductImage src={img} alt="" hover={false} />
                  </button>
                ))}
              </div>
            )}

            {/* Trust signals */}
            <div className="hidden lg:grid grid-cols-1 gap-4 mt-8 bg-white p-6 rounded-[32px] border border-zinc-200">
              {[
                { icon: RefreshCw, title: "30-Day Returns", desc: "Hassle-free process" },
                { icon: Truck, title: "Free Delivery", desc: "Carbon neutral shipping" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-center gap-4 p-2">
                  <div className="h-12 w-12 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                    <Icon className="h-6 w-6 text-black" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{title}</p>
                    <p className="text-xs text-zinc-500 font-medium">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Product Info */}
          <div className="space-y-8 min-w-0">
            <div className="bg-white rounded-[32px] border border-zinc-200 p-5 sm:p-8 lg:p-10">
              <p className="text-sm font-bold uppercase tracking-wide text-zinc-500 mb-2">{product.brand}</p>
              <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4 break-words">{product.name}</h1>

              {/* Rating */}
              <div className="flex items-center gap-2 mb-8">
                <div className="flex">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={`h-4 w-4 ${i <= Math.round(product.rating) ? "fill-amber-400 text-amber-400" : "text-zinc-200 dark:text-zinc-800"}`} />
                  ))}
                </div>
                <span className="text-sm font-bold">{product.rating.toFixed(1)}</span>
                <span className="text-sm text-zinc-500">({product.reviewCount} reviews)</span>
              </div>

              {/* Condition badge */}
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Condition</p>
                {(() => {
                  const grade = getGradeConfig(product.condition ?? '');
                  return (
                    <>
                      <GradeBadge condition={product.condition ?? ''} size="lg" />
                      {grade.desc && (
                        <p className="text-xs text-zinc-500 mt-2 font-medium flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5" /> {grade.desc}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Price */}
              {(product.price ?? 0) > 0 ? (
                <div className="flex items-baseline gap-4 mb-8">
                  <span className="text-5xl font-bold tracking-tight">£{(product.price as number).toFixed(2)}</span>
                  {product.comparePrice && (
                    <span className="text-xl text-zinc-400 line-through font-medium">£{product.comparePrice.toFixed(2)}</span>
                  )}
                  {savings > 0 && (
                    <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                      Save £{savings.toFixed(2)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="mb-8">
                  <span className="text-3xl font-bold text-zinc-400 italic">Price on Request</span>
                  <p className="text-sm text-zinc-500 mt-1">Contact us for pricing on this item.</p>
                </div>
              )}

              {/* Stock */}
              {(product.price ?? 0) > 0 && product.stock <= 5 && product.stock > 0 && (
                <p className="text-sm font-bold text-amber-700 bg-amber-50 px-3 py-2 rounded-xl mb-6">
                  Only {product.stock} left in stock — order soon
                </p>
              )}

              {/* Add to cart / Enquire */}
              <div className="flex gap-3 mb-8">
                {(product.price ?? 0) > 0 ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleAddToCart}
                    disabled={product.stock === 0}
                    className={`flex-1 h-16 rounded-[1.5rem] font-bold text-base flex items-center justify-center gap-2 transition-all ${
                      product.stock === 0
                        ? "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                        : added
                        ? "bg-emerald-500 text-white"
                        : "bg-accent text-white hover:bg-accent-dark shadow-lg shadow-accent/20"
                    }`}
                  >
                    {product.stock === 0 ? (
                      "Out of stock"
                    ) : added ? (
                      <><Check className="h-5 w-5" strokeWidth={3} /> Added to cart</>
                    ) : (
                      <><ShoppingCart className="h-5 w-5" /> Add to cart</>
                    )}
                  </motion.button>
                ) : (
                  <a
                    href="mailto:info@techstopleicester.co.uk"
                    className="flex-1 h-16 rounded-[1.5rem] font-bold text-base flex items-center justify-center gap-2 bg-zinc-800 text-white hover:bg-zinc-700 transition-all"
                  >
                    Enquire about this item
                  </a>
                )}
              </div>

              {/* Quick features from specs */}
              {Object.keys(specs).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {Object.entries(specs).slice(0, 4).map(([k, v]) => (
                    <span key={k} className="text-xs font-bold bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-full text-zinc-700">
                      {String(v)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Expandable sections */}
            <div className="bg-white rounded-[32px] border border-zinc-200 overflow-hidden divide-y divide-zinc-100">
              {[
                {
                  id: "description",
                  title: "Description",
                  content: (
                    <p className="text-sm text-zinc-600 leading-relaxed font-medium">
                      {product.description || `${product.name} in ${product.condition} condition. Fully tested and certified by our expert technicians.`}
                    </p>
                  ),
                },
                {
                  id: "specs",
                  title: "Specifications",
                  content: Object.keys(specs).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(specs).map(([key, val]) => (
                        <div key={key} className="flex justify-between py-2 border-b border-zinc-50 last:border-0">
                          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">{key}</span>
                          <span className="text-sm font-medium text-right">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400">No specifications available.</p>
                  ),
                },
                {
                  id: "returns",
                  title: "Returns & Inspection",
                  content: (
                    <div className="space-y-4 text-sm text-zinc-600 font-medium">
                      <div className="flex items-start gap-3">
                        <RefreshCw className="h-5 w-5 text-black flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                        <p><strong>30-Day Returns</strong> — Changed your mind? Return it within 30 days for a full refund, completely free of charge.</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <Award className="h-5 w-5 text-black flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                        <p><strong>25-Point Inspection</strong> — Certified experts test every device before it ships to you.</p>
                      </div>
                    </div>
                  ),
                },
              ].map(({ id, title, content }) => (
                <div key={id}>
                  <button
                    onClick={() => setExpandedSection(prev => prev === id ? null : id)}
                    className="w-full flex items-center justify-between px-8 py-5 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="font-bold text-base">{title}</span>
                    {expandedSection === id ? <ChevronUp className="h-5 w-5 text-zinc-400" /> : <ChevronDown className="h-5 w-5 text-zinc-400" />}
                  </button>
                  <AnimatePresence>
                    {expandedSection === id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-8 pb-6">{content}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* Mobile trust signals */}
            <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: RefreshCw, title: "30-Day Returns" },
                { icon: Truck, title: "Free Delivery" },
              ].map(({ icon: Icon, title }) => (
                <div key={title} className="bg-white rounded-[1.5rem] border border-zinc-200 p-4 flex flex-row sm:flex-col items-center sm:justify-center gap-3.5 sm:gap-2 text-left sm:text-center">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-black" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-xs sm:text-[10px] font-bold leading-tight text-zinc-950">{title}</p>
                    <p className="text-[10px] text-zinc-400 font-semibold sm:hidden mt-0.5">
                      {title === "30-Day Returns" ? "Hassle-free process" : "Carbon neutral shipping"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── Reviews Section ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-black" strokeWidth={1.5} />
            <h2 className="text-2xl font-bold">Customer Reviews</h2>
            {reviews.length > 0 && (
              <span className="text-sm font-bold text-zinc-400">({reviews.length})</span>
            )}
          </div>
          {!showReviewForm && (
            <button
              onClick={() => { setShowReviewForm(true); setReviewSubmitted(false); }}
              className="h-10 px-5 rounded-2xl bg-accent text-white text-sm font-bold hover:bg-accent-dark transition-colors shadow-md shadow-accent/10"
            >
              Write a Review
            </button>
          )}
        </div>

        {/* Rating summary */}
        {reviews.length > 0 && (
          <div className="bg-white rounded-[24px] border border-zinc-200 p-6 mb-6 flex flex-col sm:flex-row items-center gap-8">
            <div className="text-center shrink-0">
              <p className="text-6xl font-bold">{product.rating.toFixed(1)}</p>
              <div className="flex justify-center mt-2">
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className={`h-4 w-4 ${i <= Math.round(product.rating) ? "fill-amber-400 text-amber-400" : "text-zinc-200 dark:text-zinc-800"}`} />
                ))}
              </div>
              <p className="text-xs text-zinc-500 font-medium mt-1">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex-1 w-full space-y-2">
              {[5,4,3,2,1].map(star => {
                const count = reviews.filter(r => r.rating === star).length;
                const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-4 text-right">{star}</span>
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                    <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-zinc-400 font-medium w-8">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Review form */}
        <AnimatePresence>
          {showReviewForm && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className="bg-white rounded-[24px] border border-zinc-200 p-6 mb-6"
            >
              {reviewSubmitted ? (
                <div className="flex flex-col items-center py-8 gap-4 text-center">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Check className="h-8 w-8 text-emerald-600" strokeWidth={2.5} />
                  </div>
                  <p className="text-xl font-bold">Thank you for your review!</p>
                  <p className="text-sm text-zinc-500 max-w-sm">Your review is pending approval and will appear here once our team verifies it.</p>
                  <button onClick={() => setShowReviewForm(false)} className="mt-2 text-sm font-bold text-black underline underline-offset-2">
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitReview} className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Leave a Review</h3>
                    <button type="button" onClick={() => setShowReviewForm(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Star picker */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Your Rating</p>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(i => (
                        <button
                          key={i}
                          type="button"
                          onMouseEnter={() => setHoverRating(i)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setReviewRating(i)}
                          className="p-1"
                        >
                          <Star className={`h-7 w-7 transition-colors ${i <= (hoverRating || reviewRating) ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Name (guest) */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block mb-1.5">Your Name</label>
                    <input
                      value={reviewName}
                      onChange={e => setReviewName(e.target.value)}
                      placeholder="e.g. John D."
                      className="w-full h-12 px-4 rounded-2xl border border-zinc-200 bg-zinc-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block mb-1.5">Review</label>
                    <textarea
                      value={reviewBody}
                      onChange={e => setReviewBody(e.target.value)}
                      placeholder="What did you think of this product?"
                      rows={4}
                      required
                      className="w-full px-4 py-3 rounded-2xl border border-zinc-200 bg-zinc-50 text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  {/* Image upload */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Photos (optional, up to 5)</p>
                    <div className="flex flex-wrap gap-3">
                      {reviewPreviews.map((src, idx) => (
                        <div key={idx} className="relative h-20 w-20 rounded-2xl overflow-hidden border border-zinc-200">
                          <img src={src} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeReviewImage(idx)}
                            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center"
                          >
                            <X className="h-3 w-3 text-white" />
                          </button>
                        </div>
                      ))}
                      {reviewImages.length < 5 && (
                        <button
                          type="button"
                          onClick={() => reviewFileRef.current?.click()}
                          className="h-20 w-20 rounded-2xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-1 text-zinc-400 hover:border-zinc-400 hover:text-zinc-500 transition-colors"
                        >
                          <Camera className="h-5 w-5" />
                          <span className="text-[10px] font-bold">Add</span>
                        </button>
                      )}
                      <input
                        ref={reviewFileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={e => handleReviewImages(e.target.files)}
                      />
                    </div>
                  </div>

                  {reviewError && (
                    <p className="text-sm font-medium text-red-600 bg-red-50 px-4 py-3 rounded-2xl">{reviewError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submittingReview || !reviewBody.trim()}
                    className="w-full h-12 rounded-2xl bg-accent text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-accent-dark transition-colors"
                  >
                    {submittingReview ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4" /> Submit Review</>}
                  </button>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Review list */}
        {loadingReviews ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-white rounded-[24px] border border-zinc-200 p-6 animate-pulse">
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-zinc-100 shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-zinc-100 rounded-full w-1/4" />
                    <div className="h-3 bg-zinc-100 rounded-full w-1/5" />
                    <div className="h-3 bg-zinc-100 rounded-full w-3/4" />
                    <div className="h-3 bg-zinc-100 rounded-full w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-[24px] border border-zinc-200 p-10 flex flex-col items-center gap-3 text-center">
            <Star className="h-10 w-10 text-zinc-200" />
            <p className="font-bold text-lg">No reviews yet</p>
            <p className="text-sm text-zinc-500">Be the first to share your thoughts on this product.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map(review => {
              const displayName = review.user?.name ?? review.guestName ?? "Customer";
              const initials = displayName.charAt(0).toUpperCase();
              return (
                <div key={review.id} className="bg-white rounded-[24px] border border-zinc-200 p-6">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 font-bold text-sm">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-bold text-sm">{displayName}</p>
                        <p className="text-xs text-zinc-400">{new Date(review.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                      </div>
                      <div className="flex mt-1 mb-3">
                        {[1,2,3,4,5].map(i => (
                          <Star key={i} className={`h-3.5 w-3.5 ${i <= review.rating ? "fill-amber-400 text-amber-400" : "text-zinc-200"}`} />
                        ))}
                      </div>
                      <p className="text-sm text-zinc-600 leading-relaxed">{review.body}</p>
                      {review.images.length > 0 && (
                        <div className="flex gap-2 mt-4 flex-wrap">
                          {review.images.map((img, i) => (
                            <ProductImage
                              key={i}
                              src={img}
                              alt=""
                              mode="cover"
                              hover={false}
                              width={80}
                              height={80}
                              wrapperClassName="rounded-2xl border border-zinc-200"
                              iconClassName="h-5 w-5"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
}
